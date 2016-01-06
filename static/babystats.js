


/**
 * @param {!Element} container
 * @constructor
 */
var BabyStats = function(container) {
  var urlRE = new RegExp('^/baby/([-0-9a-f]{36})$');
  var match = window.location.pathname.match(urlRE);
  if (!match) {
    window.location.pathname = '/baby/' + Cosmopolite.uuid();
    return;
  }
  var id = match[1];

  this.container_ = container;

  this.tileScaleHeight_ = 1;
  this.tileScaleWidth_ = 1;

  this.tiles_ = [
    {
      type: 'asleep',
      description: 'Asleep',
      cancels: ['awake'],
      ignore_duplicates: true,
    },
    {
      type: 'awake',
      description: 'Awake',
      cancels: ['asleep'],
      ignore_duplicates: true,
    },
    {
      type: 'diaper_feces',
      description: 'Diaper change\n(feces)',
      implies: ['awake'],
      timeout: 60 * 30,
    },
    {
      type: 'diaper_urine',
      description: 'Diaper change\n(urine only)',
      implies: ['awake'],
      timeout: 60 * 30,
    },
    {
      type: 'feeding_breast',
      description: 'Feeding\n(breast)',
      implies: ['awake'],
      timeout: 60 * 30,
    },
    {
      type: 'feeding_bottle_milk',
      description: 'Feeding\n(bottled breast milk)',
      implies: ['awake'],
      timeout: 60 * 30,
    },
    {
      type: 'feeding_formula',
      description: 'Feeding\n(formula)',
      implies: ['awake'],
      timeout: 60 * 30,
    },
    {
      type: 'bath',
      description: 'Bath',
      implies: ['awake'],
      timeout: 60 * 30,
    },
    {
      type: 'pumped',
      description: 'Breast pumped',
      timeout: 60 * 30,
    },
    {
      type: 'measurements',
      description: 'Weight & Temp',
      custom_handler: this.promptForMeasurements_.bind(this),
      timeout: 60 * 30,
    },
  ];
  this.tilesByType_ = {};
  this.tiles_.forEach(function(tile) {
    this.tilesByType_[tile.type] = tile;
  }.bind(this));

  this.intervals_ = {};

  google.charts.load('current', {'packages':['corechart']});
  google.charts.setOnLoadCallback(this.onChartsReady_.bind(this));

  this.buildStylesheet_();

  this.cosmo_ = new Cosmopolite();
  this.cosmo_.addEventListener('login', this.onLogin_.bind(this));
  this.cosmo_.addEventListener('logout', this.onLogout_.bind(this));

  this.client_id_ = this.cosmo_.uuid();
  hogfather.PublicChat.Join(this.cosmo_, id).then(this.onChatReady_.bind(this));
};


/**
 * @private
 */
BabyStats.prototype.onChartsReady_ = function() {
  this.weightTable_ = new google.visualization.DataTable();
  this.weightTable_.addColumn('datetime', 'Sample Date');
  this.weightTable_.addColumn('number', 'Weight');

  this.tempTable_ = new google.visualization.DataTable();
  this.tempTable_.addColumn('datetime', 'Sample Date');
  this.tempTable_.addColumn('number', 'Temperature');

  this.checkInit_();
};


/**
 * @param {hogfather.PublicChat} chat
 * @private
 */
BabyStats.prototype.onChatReady_ = function(chat) {
  this.chat_ = chat;
  this.checkInit_();
};


/**
 * @private
 */
BabyStats.prototype.checkInit_ = function() {
  if (!this.chat_ || !this.weightTable_) {
    return;
  }

  this.buildCells_();
  this.buildLayout_();

  window.addEventListener('resize', this.rebuildIfNeeded_.bind(this));

  var grid = this.calculateGrid_();
  this.gridWidthCells_ = grid.gridWidthCells;
  this.gridHeightCells_ = grid.gridHeightCells;
  this.buildGrid_();

  if (!this.chat_.amWriter()) {
    // Start on back side if we're read-only.
    this.flipperRule_.style.transform = 'rotateY(180deg)';
  }

  var messages = this.chat_.getMessages();
  messages.forEach(this.handleMessage_.bind(this, false));
  this.chat_.addEventListener('message', this.onMessage_.bind(this));
  this.chat_.addEventListener('request', this.checkOverlay_.bind(this));
  this.chat_.addEventListener('request_denied', this.checkOverlay_.bind(this));
  this.chat_.addEventListener('acl_change', this.checkOverlay_.bind(this));

  this.updateTileStatus_();
  this.updateDisplayPage_();

  // Cheap hack to get the DOM to render by yielding before we turn on
  // transitions.
  window.setTimeout(this.setTransitions_.bind(this), 0);
};


/**
 * @param {Event} e
 * @private
 */
BabyStats.prototype.onLogin_ = function(e) {
  this.loginRule_.style.visibility = 'hidden';
  this.checkOverlay_();
};


/**
 * @param {Event} e
 * @private
 */
BabyStats.prototype.onLogout_ = function(e) {
  this.loginURL_ = e.detail.login_url;
  this.loginRule_.style.visibility = 'visible';
  this.checkOverlay_();
};


/**
 * @private
 */
BabyStats.prototype.onLoginClick_ = function() {
  window.open(this.loginURL_);
};


/**
 * @private
 */
BabyStats.prototype.onFlipClick_ = function() {
  if (this.flipperRule_.style.transform) {
    this.flipperRule_.style.transform = null;
  } else {
    this.flipperRule_.style.transform = 'rotateY(180deg)';
  }
};


/**
 * @param {Event} e
 * @private
 */
BabyStats.prototype.onMessage_ = function(e) {
  this.handleMessage_(true, e.detail);
};


/**
 * @param {boolean} isEvent
 * @param {Cosmopolite.typeMessage} message
 * @private
 */
BabyStats.prototype.handleMessage_ = function(isEvent, message) {
  if (message.message.sender_name &&
      !this.yourName_.value &&
      message.sender == this.cosmo_.currentProfile()) {
    this.yourName_.value = message.message.sender_name;
    this.checkOverlay_();
  }

  switch (message.message.type) {
    case 'child_name_change':
      if (!isEvent || message.message.client_id != this.client_id_) {
        this.childName_.value = message.message.child_name;
        this.checkOverlay_();
      }
      document.title = message.message.child_name;
      this.displayChildName_.textContent = message.message.child_name;
      break;

    default:
      var tile = this.tilesByType_[message.message.type];
      if (tile) {
        if (tile.ignore_duplicates && tile.active) {
          // Ignore (double trigger of a state-based tile)
        } else if (tile.active && message.created - tile.lastSeen < 60) {
          // Ignore (too fast repetition)
        } else {
          tile.lastSeen = message.created;
          tile.active = true;
          tile.messages.push(message);
          (tile.cancels || []).forEach(function(type) {
            tile2 = this.tilesByType_[type];
            tile2.active = false;
          }.bind(this));

          this.updateDisplayIncremental_(message);
          if (isEvent) {
            this.updateTileStatus_();
            this.updateDisplayPage_();
          }
        }
      } else {
        console.log('Unknown message type:', message);
      }
      break;
  }
};


/**
 * Add a CSS class to a node if it doesn't already have it.
 * @param {!Node} node Node object to add class to
 * @param {!string} className Name of class to add
 * @private
 */
BabyStats.prototype.addCSSClass_ = function(node, className) {
  var classes = node.className.split(' ').filter(function(className) {
    return className;
  });
  if (classes.indexOf(className) != -1) {
    // Already has class.
    return;
  }
  classes.push(className);
  node.className = classes.join(' ');
};


/**
 * Remove a CSS class to a node if it has it.
 * @param {!Node} node Node object to remove class from
 * @param {!string} className Name of class to remove
 * @private
 */
BabyStats.prototype.removeCSSClass_ = function(node, className) {
  var classes = node.className.split(' ').filter(function(className) {
    return className;
  });
  var i = classes.indexOf(className);
  if (i == -1) {
    // Already doesn't have class.
    return;
  }
  delete classes[i];
  node.className = classes.join(' ');
};


/**
 * Check if we need to rebuild the grid layout because of optimal layout
 * changes.
 * @param {Event} e
 * @private
 */
BabyStats.prototype.rebuildIfNeeded_ = function(e) {
  var grid = this.calculateGrid_();
  if (this.gridWidthCells_ != grid.gridWidthCells ||
      this.gridHeightCells_ != grid.gridHeightCells) {
    this.gridWidthCells_ = grid.gridWidthCells;
    this.gridHeightCells_ = grid.gridHeightCells;
    this.buildGrid_();
  }
};


/**
 * Only set transitions once loaded.
 * @private
 */
BabyStats.prototype.setTransitions_ = function() {
  this.gridOverlayRule_.style.transition = '0.4s';
  this.measurementPrompt_.style.transition = '0.4s';
  this.cellOverlayRule_.style.transition = '0.4s';
  this.flipperRule_.style.transition = '1.0s';
};


/**
 * @private
 * @param {Element} stylesheet
 * @param {string} selector
 * @return {CSSRule}
 */
BabyStats.prototype.addStyle_ = function(stylesheet, selector) {
  stylesheet.sheet.insertRule(selector + ' {}', 0);
  return stylesheet.sheet.cssRules[0];
};


/**
 * Construct our stylesheet and insert it into the DOM.
 * @private
 */
BabyStats.prototype.buildStylesheet_ = function() {
  var style = document.createElement('style');
  document.head.appendChild(style);

  this.flipperRule_ = this.addStyle_(style, 'babyStatsFlipper');
  this.loginRule_ = this.addStyle_(style, '.babyStatsLogin');
  this.gridOverlayRule_ = this.addStyle_(style, 'babyStatsGridOverlay');
  this.rowRule_ = this.addStyle_(style, 'babyStatsRow');
  this.cellRule_ = this.addStyle_(style, 'babyStatsCell');
  this.cellOverlayRule_ = this.addStyle_(style, 'babyStatsCellOverlay');
};


/**
 * Construct babyStateCell elements for insertion into the DOM.
 * @private
 */
BabyStats.prototype.buildCells_ = function() {
  this.cells_ = [];
  this.tiles_.forEach(function(tile) {
    tile.active = false;
    tile.messages = [];

    var cell = document.createElement('babyStatsCell');
    this.cells_.push(cell);

    var contents = document.createElement('babyStatsCellContents');
    contents.textContent = tile.description;
    cell.appendChild(contents);

    tile.statusBox = document.createElement('babyStatsCellStatus');
    cell.appendChild(tile.statusBox);

    tile.overlay = document.createElement('babyStatsCellOverlay');
    cell.appendChild(tile.overlay);

    if (tile.custom_handler) {
      cell.addEventListener('click', tile.custom_handler);
    } else {
      cell.addEventListener('click', this.onClick_.bind(this, tile));
    }
  }, this);
  window.setInterval(this.updateTileStatus_.bind(this), 60 * 1000);
  window.setInterval(this.updateDisplayPage_.bind(this), 60 * 1000);
};


/**
 * Handle a click event on a button.
 * @param {Object} tile tile description struct
 * @private
 */
BabyStats.prototype.onClick_ = function(tile) {
  if (this.intervals_[tile.type]) {
    window.clearInterval(this.intervals_[tile.type]);
    delete this.intervals_[tile.type];
    tile.overlay.style.opacity = 0.0;
    return;
  }
  (tile.implies || []).forEach(function(type) {
    var tile2 = this.tilesByType_[type];
    if (!tile2.active && !this.intervals_[type]) {
      this.onClick_(tile2);
    }
  }.bind(this));
  var timer = 5;
  tile.overlay.textContent = timer;
  tile.overlay.style.opacity = 0.5;
  this.intervals_[tile.type] = window.setInterval(function() {
    timer--;
    switch (timer) {
      case 0:
        this.chat_.sendMessage({
          type: tile.type,
          sender_name: this.yourName_.value,
        });
        tile.overlay.textContent = '✓';
        break;

      case -1:
        break;

      case -2:
        window.clearInterval(this.intervals_[tile.type]);
        delete this.intervals_[tile.type];
        tile.overlay.style.opacity = 0.0;
        break;

      default:
        tile.overlay.textContent = timer;
        break;
    }
  }.bind(this), 1000);
};


/**
 * Calculate optimal grid sizing.
 * This pile of magic math calculates the optimal grid width and height to
 * maximize the size of all buttons while preserving their aspect ratio.
 * @return {{
 *   gridWidthCells: number,
 *   gridHeightCells: number,
 *   cellWidthPx: number,
 *   cellHeightPx: number
 * }}
 * @private
 */
BabyStats.prototype.calculateGrid_ = function() {
  var containerWidth = this.gridContainer_.offsetWidth;
  var containerHeight = this.gridContainer_.offsetHeight;
  var numTiles = this.tiles_.length;

  var heightFactor = containerHeight / this.tileScaleHeight_;
  var widthFactor = containerWidth / this.tileScaleWidth_;

  var scaleFactor = heightFactor / widthFactor;

  var gridHeight = Math.sqrt(scaleFactor * numTiles);
  var gridWidth = Math.sqrt(numTiles / scaleFactor);

  var gridOptions = [
    [Math.ceil(gridWidth), Math.floor(gridHeight)],
    [Math.floor(gridWidth), Math.ceil(gridHeight)],
    [Math.ceil(gridWidth), Math.ceil(gridHeight)],
  ];

  // Check all possible options.
  // We are optimizing for several dimensions (decreasing priority):
  // 1) Be able to fit all the tiles.
  // 2) Maximum scale for an image in each cell.
  // 3) Minimize number of cells.
  var minCells = Number.MAX_VALUE;
  var maxScale = 0.0;
  var chosenHeight, chosenWidth;
  gridOptions.forEach(function(gridOption) {
    var numCells = gridOption[0] * gridOption[1];
    if (numCells < numTiles) {
      // Can't fit all the tiles in (we've rounded down too far).
      return;
    }
    var widthScale = (containerWidth / gridOption[0]) / this.tileScaleWidth_;
    var heightScale = (containerHeight / gridOption[1]) / this.tileScaleHeight_;
    var scale;
    if (widthScale < heightScale) {
      scale = widthScale;
    } else {
      scale = heightScale;
    }
    if (scale < maxScale) {
      // This would make cells smaller than another viable solution.
      return;
    }
    if (scale == maxScale && numCells > minCells) {
      // Same cell size as another viable solution, but ours has more cells.
      return;
    }
    chosenWidth = gridOption[0];
    chosenHeight = gridOption[1];
    minCells = numCells;
    maxScale = scale;
  }, this);

  return /** @struct */ {
    gridWidthCells: chosenWidth,
    gridHeightCells: chosenHeight,
    cellWidthPx: this.tileScaleWidth_ * maxScale,
    cellHeightPx: this.tileScaleHeight_ * maxScale,
  };
};


/**
 * Construct the outer DOM layout.
 * @private
 */
BabyStats.prototype.buildLayout_ = function() {
  // Allows loading screen to be embedded in the style tag.
  this.container_.removeAttribute('style');

  this.addCSSClass_(this.container_, 'babyStatsContainer');

  var flipper = document.createElement('babyStatsFlipper');
  this.container_.appendChild(flipper);

  var front = document.createElement('babyStatsFlipperFront');
  flipper.appendChild(front);

  var back = document.createElement('babyStatsFlipperBack');
  flipper.appendChild(back);

  // Front (writable) side
  this.childName_ = document.createElement('input');
  this.addCSSClass_(this.childName_, 'babyStatsChildName');
  this.childName_.placeholder = 'Child name';
  this.childName_.addEventListener('input', this.checkOverlay_.bind(this));
  this.childName_.addEventListener('input', this.onChildNameChange_.bind(this));
  front.appendChild(this.childName_);

  this.yourName_ = document.createElement('input');
  this.addCSSClass_(this.yourName_, 'babyStatsYourName');
  this.yourName_.placeholder = 'Your name';
  this.yourName_.value = localStorage.getItem('babyStats:yourName') || '';
  this.yourName_.addEventListener('input', this.checkOverlay_.bind(this));
  this.yourName_.addEventListener('input', this.onYourNameChange_.bind(this));
  front.appendChild(this.yourName_);

  var login = document.createElement('img');
  this.addCSSClass_(login, 'babyStatsLogin');
  login.src = '/static/google.svg';
  login.addEventListener('click', this.onLoginClick_.bind(this));
  front.appendChild(login);

  this.gridContainer_ = document.createElement('babyStatsGridContainer');
  front.appendChild(this.gridContainer_);

  this.measurementPrompt_ =
      document.createElement('babyStatsMeasurementPrompt');
  front.appendChild(this.measurementPrompt_);

  var weight = document.createElement('babyStatsWeight');
  this.measurementPrompt_.appendChild(weight);

  this.weightKg_ = document.createElement('input');
  this.addCSSClass_(this.weightKg_, 'babyStatsWeightKg');
  weight.appendChild(this.weightKg_);
  this.weightKg_.addEventListener('input', function() {
    var lb = (parseFloat(this.weightKg_.value) || 0) * 2.2046;
    this.weightLb_.value = Math.floor(lb);
    this.weightOz_.value = Math.round(((lb - Math.floor(lb)) * 16) * 10) / 10;
  }.bind(this));

  weight.appendChild(document.createTextNode('kg = '));

  var LbOzToKg = function() {
    var lb = (
        (parseFloat(this.weightLb_.value) || 0) +
        ((parseFloat(this.weightOz_.value) || 0) / 16));
    this.weightKg_.value = Math.round((lb / 2.2046) * 10) / 10;
  }.bind(this);

  this.weightLb_ = document.createElement('input');
  this.addCSSClass_(this.weightLb_, 'babyStatsWeightLb');
  weight.appendChild(this.weightLb_);
  this.weightLb_.addEventListener('input', LbOzToKg);

  weight.appendChild(document.createTextNode('lb '));

  this.weightOz_ = document.createElement('input');
  this.addCSSClass_(this.weightOz_, 'babyStatsWeightOz');
  weight.appendChild(this.weightOz_);
  this.weightOz_.addEventListener('input', LbOzToKg);

  weight.appendChild(document.createTextNode('oz'));

  var temp = document.createElement('babyStatsTemp');
  this.measurementPrompt_.appendChild(temp);

  this.tempC_ = document.createElement('input');
  this.addCSSClass_(this.tempC_, 'babyStatsTempC');
  temp.appendChild(this.tempC_);
  this.tempC_.addEventListener('input', function() {
    this.tempF_.value =
        Math.round(((parseFloat(this.tempC_.value) || 0) * 1.8 + 32) * 10) / 10;
  }.bind(this));

  temp.appendChild(document.createTextNode('°C = '));

  this.tempF_ = document.createElement('input');
  this.addCSSClass_(this.tempF_, 'babyStatsTempF');
  temp.appendChild(this.tempF_);
  this.tempF_.addEventListener('input', function() {
    this.tempC_.value = Math.round(
        (((parseFloat(this.tempF_.value) || 0) - 32) / 1.8) * 10) / 10;
  }.bind(this));

  temp.appendChild(document.createTextNode('°F'));

  var measurementSubmit = document.createElement('babyStatsActionButton');
  measurementSubmit.textContent = 'Submit';
  measurementSubmit.addEventListener(
      'click', this.submitMeasurements_.bind(this));
  this.measurementPrompt_.appendChild(measurementSubmit);

  var measurementCancel = document.createElement('babyStatsActionButton');
  measurementCancel.textContent = 'Cancel';
  measurementCancel.addEventListener(
      'click', this.cancelMeasurementPrompt_.bind(this));
  this.measurementPrompt_.appendChild(measurementCancel);

  this.gridOverlay_ = document.createElement('babyStatsGridOverlay');
  front.appendChild(this.gridOverlay_);

  // Back (read-only) side
  this.displayChildName_ = document.createElement('babyStatsDisplayChildName');
  back.appendChild(this.displayChildName_);

  this.displaySleepSummary_ =
      document.createElement('babyStatsDisplaySleepSummary');
  back.appendChild(this.displaySleepSummary_);
  this.displaySleepSummary_.appendChild(document.createTextNode('has been '));
  this.displaySleepStatus_ =
      document.createElement('babyStatsDisplaySleepStatus');
  this.displaySleepSummary_.appendChild(this.displaySleepStatus_);
  this.displaySleepSummary_.appendChild(document.createTextNode(' for '));
  this.displaySleepDuration_ =
      document.createElement('babyStatsDisplaySleepDuration');
  this.displaySleepSummary_.appendChild(this.displaySleepDuration_);

  var displayEventCounts =
      document.createElement('babyStatsDisplayEventCounts');
  back.appendChild(displayEventCounts);
  var eventCountHeader =
      document.createElement('babyStatsDisplayEventCountHeader');
  displayEventCounts.appendChild(eventCountHeader);
  eventCountHeader.appendChild(
      document.createElement('babyStatsDisplayEventCountSpacer'));
  var columns = [
    'Most recent',
    'Past 6h',
    'Past 24h',
    'Past 7d',
    'Past 30d',
    'All time',
  ];
  columns.forEach(function(column) {
    var headerCell =
        document.createElement('babyStatsDisplayEventCountHeaderTitle');
    headerCell.textContent = column;
    eventCountHeader.appendChild(headerCell);
  }.bind(this));

  this.displayEventCountCells_ = {};
  this.tiles_.forEach(function(tile) {
    var group = document.createElement('babyStatsDisplayEventCountGroup');
    displayEventCounts.appendChild(group);
    var groupTitle = document.createElement('babyStatsDisplayEventCountTitle');
    groupTitle.textContent = tile.description;
    group.appendChild(groupTitle);

    this.displayEventCountCells_[tile.type] = {};
    columns.forEach(function(column) {
      var value = document.createElement('babyStatsDisplayEventCountValue');
      group.appendChild(value);
      this.displayEventCountCells_[tile.type][column] = value;
    }.bind(this));
  }.bind(this));

  this.displayWeight_ = document.createElement('babyStatsDisplayWeight');
  back.appendChild(this.displayWeight_);
  this.weightChart_ = new google.visualization.LineChart(this.displayWeight_);

  this.displayTemp_ = document.createElement('babyStatsDisplayTemp');
  back.appendChild(this.displayTemp_);
  this.tempChart_ = new google.visualization.LineChart(this.displayTemp_);

  this.displayTimelines_ = document.createElement('babyStatsDisplayTimelines');
  back.appendChild(this.displayTimelines_);

  var flip = document.createElement('img');
  this.addCSSClass_(flip, 'babyStatsFlip');
  flip.src = '/static/flip.svg';
  flip.addEventListener('click', this.onFlipClick_.bind(this));
  this.container_.appendChild(flip);

  this.checkOverlay_();
};


/**
 * @private
 */
BabyStats.prototype.requestAccess_ = function() {
  this.chat_.requestAccess(this.yourName_.value);
};


/**
 * Make the grid overlay visible/hidden based on input field status.
 * @private
 */
BabyStats.prototype.checkOverlay_ = function() {
  if (!this.childName_) {
    // buildLayout_() hasn't run yet; not much we can do here.
    return;
  }

  if (!this.yourName_.value) {
    this.chat_.getMessages().forEach(function(message) {
      if (message.message.sender_name &&
          message.sender == this.cosmo_.currentProfile()) {
        this.yourName_.value = message.message.sender_name;
      }
    }.bind(this));
  }

  var message = '', actions = [];
  if (!this.childName_.value) {
    message = 'Please enter child name above';
  } else if (!this.yourName_.value) {
    message = 'Please enter your name above';
  } else if (!this.chat_.amWriter()) {
    if (this.chat_.getRequests().some(function(request) {
      return request.sender == this.cosmo_.currentProfile();
    }.bind(this))) {
      message = 'Access request sent.';
    } else {
      message = 'You don\'t have permission to interact with this page.';
      actions.push(['Request Access', this.requestAccess_.bind(this)]);
    }
  } else if (this.chat_.amOwner() && this.chat_.getRequests().length) {
    var request = this.chat_.getRequests()[0];
    message = 'Access request from "' + request.message.info + '"';
    actions.push(['Approve as Owner',
                  this.chat_.addOwner.bind(this.chat_, request.sender)]);
    actions.push(['Approve as Contributor',
                  this.chat_.addWriter.bind(this.chat_, request.sender)]);
    actions.push(['Deny',
                  this.chat_.denyRequest.bind(this.chat_, request.sender)]);
  }

  if (message) {
    this.gridOverlay_.style.visibility = 'visible';
    this.gridOverlay_.style.opacity = 1.0;
    this.gridOverlay_.innerHTML = '';
    this.gridOverlay_.textContent = message;
    actions.forEach(function(action) {
      var button = document.createElement('babyStatsActionButton');
      button.textContent = action[0];
      button.addEventListener('click', action[1]);
      this.gridOverlay_.appendChild(button);
    }.bind(this));
  } else {
    this.gridOverlay_.style.visibility = 'hidden';
    this.gridOverlay_.style.opacity = 0.0;
  }
};


/**
 * @private
 */
BabyStats.prototype.onChildNameChange_ = function() {
  this.chat_.sendMessage({
    type: 'child_name_change',
    child_name: this.childName_.value,
    client_id: this.client_id_,
  });
};


/**
 * Store your name value locally.
 * @private
 */
BabyStats.prototype.onYourNameChange_ = function() {
  localStorage.setItem('babyStats:yourName', this.yourName_.value);
};


/**
 * Construct the grid objects in the DOM.
 * @private
 */
BabyStats.prototype.buildGrid_ = function() {
  this.gridContainer_.innerHTML = '';

  this.rowRule_.style.height = 100 / this.gridHeightCells_ + '%';
  this.cellRule_.style.width = 100 / this.gridWidthCells_ + '%';

  var i = 0;
  for (var y = 0; y < this.gridHeightCells_; y++) {
    var row = document.createElement('babyStatsRow');
    for (var x = 0; x < this.gridWidthCells_; x++) {
      if (i < this.cells_.length) {
        var cell = this.cells_[i];
        row.appendChild(cell);
        i++;
      }
    }
    this.gridContainer_.appendChild(row);
  }
};


/**
 * @private
 * @param {number} seconds
 * @param {function(number):number=} opt_floatToInt
 * @return {string}
 */
BabyStats.prototype.secondsToHuman_ = function(seconds, opt_floatToInt) {
  var floatToInt = opt_floatToInt || Math.floor;
  if (seconds > 60 * 60 * 24 * 3) {
    return floatToInt(seconds / (60 * 60 * 24)).toString() + 'd';
  } else if (seconds > 60 * 60 * 3) {
    return floatToInt(seconds / (60 * 60)).toString() + 'h';
  } else {
    return floatToInt(seconds / 60).toString() + 'm';
  }
};


/**
 * @private
 */
BabyStats.prototype.updateTileStatus_ = function() {
  var now = Date.now() / 1000;
  this.tiles_.forEach(function(tile) {
    if (tile.lastSeen) {
      var timeSince = now - tile.lastSeen;
      tile.statusBox.textContent = (
          timeSince < 60 ?
          'just now' :
          this.secondsToHuman_(timeSince) + ' ago');
      var timedOut = tile.timeout && (now - tile.timeout > tile.lastSeen);
      if (!tile.active || timedOut) {
        this.removeCSSClass_(tile.statusBox, 'babyStatsCellStatusActive');
      } else {
        this.addCSSClass_(tile.statusBox, 'babyStatsCellStatusActive');
      }
    } else {
      tile.statusBox.textContent = 'never';
      this.removeCSSClass_(tile.statusBox, 'babyStatsCellStatusActive');
    }
  }.bind(this));
};


/**
 * @private
 */
BabyStats.prototype.updateDisplayPage_ = function() {
  if (!this.chat_) {
    return;
  }

  var now = Date.now() / 1000;

  var asleep = this.tilesByType_['asleep'];
  var awake = this.tilesByType_['awake'];
  if (asleep.active || awake.active) {
    this.displaySleepSummary_.style.visibility = 'visible';
    if (asleep.active) {
      this.displaySleepStatus_.textContent = 'asleep';
      var timeSince = now - asleep.lastSeen;
      this.displaySleepDuration_.textContent = this.secondsToHuman_(timeSince);
    } else {
      this.displaySleepStatus_.textContent = 'awake';
      var timeSince = now - awake.lastSeen;
      this.displaySleepDuration_.textContent = this.secondsToHuman_(timeSince);
    }
  } else {
    this.displaySleepSummary_.style.visibility = 'hidden';
  }

  var cutoffs = [
    ['Past 6h', 6 * 60 * 60],
    ['Past 24h', 24 * 60 * 60],
    ['Past 7d', 7 * 24 * 60 * 60],
    ['Past 30d', 30 * 24 * 60 * 60],
    ['All time', Number.MAX_VALUE],
  ];

  this.tiles_.forEach(function(tile) {
    if (tile.lastSeen) {
      var timeSince = now - tile.lastSeen;
      this.displayEventCountCells_[tile.type]['Most recent'].textContent = (
          timeSince < 60 ?
          'just now' :
          this.secondsToHuman_(timeSince) + ' ago');
    } else {
      this.displayEventCountCells_[tile.type]['Most recent'].textContent =
          'never';
    }

    var timestamps = [[], [], [], [], []];
    tile.messages.forEach(function(message) {
      cutoffs.forEach(function(cutoff, i) {
        var timeSince = now - message.created;
        if (timeSince < cutoff[1]) {
          // Sample belongs in this bucket
          timestamps[i].push(message.created);
        }
      }.bind(this));
    }.bind(this));

    cutoffs.forEach(function(cutoff, i) {
      var text = timestamps[i].length.toString();
      if (timestamps[i].length >= 2) {
        var deltas = [];
        for (var j = 1; j < timestamps[i].length; j++) {
          deltas.push(timestamps[i][j] - timestamps[i][j - 1]);
        }
        deltas.sort();
        var median = deltas[Math.floor(deltas.length / 2)];
        text += '\n⏱ ' + this.secondsToHuman_(median, Math.round);
      }
      this.displayEventCountCells_[tile.type][cutoff[0]].textContent = text;
    }.bind(this));
  }.bind(this));

  this.weightChart_.draw(this.weightTable_, {
    title: 'Weight',
    curveType: 'function',
    legend: {
      position: 'none',
    },
    hAxis: {
      gridlines: {
        color: '#E97F02',
      },
      textStyle: {
        color: '#8A9B0F',
      },
    },
    vAxis: {
      gridlines: {
        color: '#E97F02',
      },
      textStyle: {
        color: '#490A3D',
      },
      title: 'Kilograms',
      titleTextStyle: {
        color: '#490A3D',
      },
    },
    titleTextStyle: {
      color: '#8A9B0F',
      fontSize: 20,
    },
    explorer: {
      actions: [
        'dragToZoom',
        'rightClickToReset',
      ],
    },
    colors: [
      '#BD1550',
    ],
  });

  this.tempChart_.draw(this.tempTable_, {
    title: 'Temperature (last 7 days)',
    curveType: 'function',
    legend: {
      position: 'none',
    },
    hAxis: {
      gridlines: {
        color: '#E97F02',
      },
      textStyle: {
        color: '#8A9B0F',
      },
      viewWindow: {
        min: new Date((now - (60 * 60 * 24 * 7)) * 1000),
      },
    },
    vAxis: {
      gridlines: {
        color: '#E97F02',
      },
      textStyle: {
        color: '#490A3D',
      },
      title: '° Celsius',
      titleTextStyle: {
        color: '#490A3D',
      },
    },
    titleTextStyle: {
      fontSize: 20,
      color: '#8A9B0F',
    },
    explorer: {
      actions: [
        'dragToZoom',
        'rightClickToReset',
      ],
    },
    colors: [
      '#BD1550',
    ],
  });
};


/**
 * @private
 * @param {Cosmopolite.typeMessage} message
 */
BabyStats.prototype.updateDisplayIncremental_ = function(message) {
  var date = new Date(message.created * 1000);

  switch (message.message.type) {
    case 'measurements':
      if (message.message.weight_kg) {
        this.weightTable_.addRow([date, message.message.weight_kg]);
      }
      if (message.message.temp_c) {
        this.tempTable_.addRow([date, message.message.temp_c]);
      }
      break;
  }

  /*
  var dateStr =
      date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
  var days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  date.toLocaleDateString() + ' (' + days[date.getDay()] + ')';
  */
};


/**
 * @private
 */
BabyStats.prototype.promptForMeasurements_ = function() {
  this.weightKg_.value = null;
  this.weightLb_.value = null;
  this.weightOz_.value = null;
  this.tempC_.value = null;
  this.tempF_.value = null;
  this.measurementPrompt_.style.visibility = 'visible';
  this.measurementPrompt_.style.opacity = 1.0;
};


/**
 * @private
 */
BabyStats.prototype.cancelMeasurementPrompt_ = function() {
  this.measurementPrompt_.style.visibility = 'hidden';
  this.measurementPrompt_.style.opacity = 0.0;
};


/**
 * @private
 */
BabyStats.prototype.submitMeasurements_ = function() {
  var msg = {
    type: 'measurements',
    sender_name: this.yourName_.value,
  };
  if (parseFloat(this.weightKg_.value) > 0) {
    msg.weight_kg = parseFloat(this.weightKg_.value);
  }
  if (parseFloat(this.tempC_.value) > 0) {
    msg.temp_c = parseFloat(this.tempC_.value);
  }
  this.chat_.sendMessage(msg);
  this.measurementPrompt_.style.visibility = 'hidden';
  this.measurementPrompt_.style.opacity = 0.0;
};
