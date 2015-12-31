


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
    },
    {
      type: 'awake',
      description: 'Awake',
      cancels: ['asleep'],
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
  ];

  this.intervals_ = {};

  this.buildStylesheet_();

  this.cosmo_ = new Cosmopolite();
  this.cosmo_.addEventListener('login', this.onLogin_.bind(this));
  this.cosmo_.addEventListener('logout', this.onLogout_.bind(this));

  this.client_id_ = this.cosmo_.uuid();
  hogfather.PublicChat.Join(this.cosmo_, id).then(this.onChatReady_.bind(this));
};


/**
 * @param {hogfather.PublicChat} chat
 * @private
 */
BabyStats.prototype.onChatReady_ = function(chat) {
  this.chat_ = chat;

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
 * @param {string} type
 * @return {Object}
 * @private
 */
BabyStats.prototype.findTile_ = function(type) {
  return this.tiles_.find(function(tile) { return tile.type == type; });
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
      var tile = this.findTile_(message.message.type);
      if (tile) {
        tile.lastSeen = message.created;
        tile.canceled = false;
        (tile.cancels || []).forEach(function(type) {
          tile2 = this.findTile_(type);
          tile2.canceled = true;
        }.bind(this));
        this.updateTileStatus_();
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
  this.cellOverlayRule_.style.transition = '0.4s';
  this.flipperRule_.style.transition = '1.0s';
};


/**
 * Construct our stylesheet and insert it into the DOM.
 * @private
 */
BabyStats.prototype.buildStylesheet_ = function() {
  // http://www.colourlovers.com/palette/848743/(%E2%97%95_%E2%80%9D_%E2%97%95)
  var style = document.createElement('style');
  document.head.appendChild(style);

  style.sheet.insertRule('.babyStatsContainer {}', 0);
  var containerRule = style.sheet.cssRules[0];
  containerRule.style.backgroundColor = 'white';

  style.sheet.insertRule('.babyStatsFlip {}', 0);
  var flip = style.sheet.cssRules[0];
  flip.style.position = 'absolute';
  flip.style.top = 0;
  flip.style.left = 0;
  flip.style.height = '32px';
  flip.style.width = '32px';
  flip.style.margin = '4px';
  flip.style.cursor = 'pointer';

  style.sheet.insertRule('babyStatsFlipper {}', 0);
  this.flipperRule_ = style.sheet.cssRules[0];
  this.flipperRule_.style.position = 'absolute';
  this.flipperRule_.style.top = 0;
  this.flipperRule_.style.left = 0;
  this.flipperRule_.style.bottom = 0;
  this.flipperRule_.style.right = 0;
  this.flipperRule_.style.transformStyle = 'preserve-3d';

  style.sheet.insertRule('babyStatsFlipperFront {}', 0);
  var front = style.sheet.cssRules[0];
  front.style.position = 'absolute';
  front.style.top = 0;
  front.style.left = 0;
  front.style.bottom = 0;
  front.style.right = 0;
  front.style.backfaceVisibility = 'hidden';
  front.style.zIndex = 2;

  style.sheet.insertRule('babyStatsFlipperBack {}', 0);
  var front = style.sheet.cssRules[0];
  front.style.position = 'absolute';
  front.style.top = 0;
  front.style.left = 0;
  front.style.bottom = 0;
  front.style.right = 0;
  front.style.backfaceVisibility = 'hidden';
  front.style.transform = 'rotateY(180deg)';

  // Front side
  style.sheet.insertRule('.babyStatsChildName, .babyStatsYourName {}', 0);
  var inputs = style.sheet.cssRules[0];
  inputs.style.display = 'block';
  inputs.style.height = '32px';
  inputs.style.width = '100%';
  inputs.style.border = 'none';
  inputs.style.borderRadius = 0;
  inputs.style.padding = '4px';
  inputs.style.backgroundColor = 'rgb(189,21,80)';
  inputs.style.color = 'rgb(248,202,0)';
  inputs.style.fontSize = '28px';
  inputs.style.textAlign = 'center';

  style.sheet.insertRule(
      '.babyStatsChildName:focus, ' +
      '.babyStatsYourName:focus {}', 0);
  var focus = style.sheet.cssRules[0];
  focus.style.outline = 'none';

  style.sheet.insertRule('.babyStatsLogin {}', 0);
  this.loginRule_ = style.sheet.cssRules[0];
  this.loginRule_.style.position = 'absolute';
  this.loginRule_.style.top = 0;
  this.loginRule_.style.right = 0;
  this.loginRule_.style.height = '32px';
  this.loginRule_.style.width = '32px';
  this.loginRule_.style.margin = '4px';
  this.loginRule_.style.cursor = 'pointer';
  this.loginRule_.style.visibility = 'hidden';

  style.sheet.insertRule('babyStatsGridOverlay {}', 0);
  this.gridOverlayRule_ = style.sheet.cssRules[0];
  this.gridOverlayRule_.style.display = 'flex';
  this.gridOverlayRule_.style.position = 'absolute';
  this.gridOverlayRule_.style.top = '80px';
  this.gridOverlayRule_.style.left = 0;
  this.gridOverlayRule_.style.bottom = 0;
  this.gridOverlayRule_.style.right = 0;
  this.gridOverlayRule_.style.alignItems = 'center';
  this.gridOverlayRule_.style.flexDirection = 'column';
  this.gridOverlayRule_.style.justifyContent = 'center';
  this.gridOverlayRule_.style.textAlign = 'center';
  this.gridOverlayRule_.style.backgroundColor = 'rgba(255,255,255,0.7)';
  this.gridOverlayRule_.style.color = 'rgb(189,21,80)';
  this.gridOverlayRule_.style.textShadow = '0 0 2px rgb(248,202,0)';
  this.gridOverlayRule_.style.fontSize = '6vmin';
  this.gridOverlayRule_.style.fontWeight = 'bold';

  style.sheet.insertRule('babyStatsActionButton {}', 0);
  var actionButton = style.sheet.cssRules[0];
  actionButton.style.display = 'flex';
  actionButton.style.minWidth = '35vmin';
  actionButton.style.padding = '10px';
  actionButton.style.margin = '5px';
  actionButton.style.borderRadius = '15px';
  actionButton.style.alignItems = 'center';
  actionButton.style.justifyContent = 'center';
  actionButton.style.backgroundColor = 'rgb(138,155,15)';
  actionButton.style.color = 'rgb(248,202,0)';
  actionButton.style.fontSize = '3vmin';
  actionButton.style.fontWeight = 'normal';
  actionButton.style.textShadow = 'none';
  actionButton.style.cursor = 'pointer';
  actionButton.style.webkitUserSelect = 'none';
  actionButton.style.mozUserSelect = 'none';
  actionButton.style.userSelect = 'none';

  style.sheet.insertRule('babyStatsGridContainer {}', 0);
  var gridContainer = style.sheet.cssRules[0];
  gridContainer.style.position = 'absolute';
  gridContainer.style.top = '80px';
  gridContainer.style.left = 0;
  gridContainer.style.bottom = 0;
  gridContainer.style.right = 0;

  style.sheet.insertRule('babyStatsRow {}', 0);
  this.rowRule_ = style.sheet.cssRules[0];
  this.rowRule_.style.display = 'block';
  this.rowRule_.style.textAlign = 'center';

  style.sheet.insertRule('babyStatsCell {}', 0);
  this.cellRule_ = style.sheet.cssRules[0];
  this.cellRule_.style.display = 'inline-block';
  this.cellRule_.style.position = 'relative';
  this.cellRule_.style.height = '100%';
  this.cellRule_.style.webkitUserSelect = 'none';
  this.cellRule_.style.mozUserSelect = 'none';
  this.cellRule_.style.userSelect = 'none';
  this.cellRule_.style.cursor = 'pointer';

  style.sheet.insertRule('babyStatsCellStatus {}', 0);
  var statusBox = style.sheet.cssRules[0];
  statusBox.style.display = 'flex';
  statusBox.style.position = 'absolute';
  statusBox.style.bottom = '5px';
  statusBox.style.right = '5px';
  statusBox.style.width = '15vmin';
  statusBox.style.height = '5vmin';
  statusBox.style.alignItems = 'center';
  statusBox.style.justifyContent = 'center';
  statusBox.style.borderTopLeftRadius = '15px';
  statusBox.style.borderBottomRightRadius = '15px';
  statusBox.style.backgroundColor = 'rgb(189,21,80)';
  statusBox.style.color = 'rgb(248,202,0)';
  statusBox.style.fontSize = '3vmin';

  style.sheet.insertRule('.babyStatsCellStatusActive {}', 0);
  var statusBoxActive = style.sheet.cssRules[0];
  statusBoxActive.style.backgroundColor = 'rgb(138,155,15)';

  style.sheet.insertRule('babyStatsCellContents {}', 0);
  var contents = style.sheet.cssRules[0];
  contents.style.display = 'flex';
  contents.style.position = 'absolute';
  contents.style.alignItems = 'center';
  contents.style.justifyContent = 'center';
  contents.style.margin = '5px';
  contents.style.padding = '5px';
  contents.style.height = 'calc(100% - 20px)';
  contents.style.width = 'calc(100% - 20px)';
  contents.style.fontSize = '6vmin';
  contents.style.fontWeight = 'bold';
  contents.style.whiteSpace = 'pre-line';
  contents.style.backgroundColor = 'rgb(73,10,61)';
  contents.style.color = 'rgb(233,127,2)';
  contents.style.borderRadius = '15px';

  style.sheet.insertRule('babyStatsCellOverlay {}', 0);
  this.cellOverlayRule_ = style.sheet.cssRules[0];
  this.cellOverlayRule_.style.display = 'flex';
  this.cellOverlayRule_.style.position = 'absolute';
  this.cellOverlayRule_.style.alignItems = 'center';
  this.cellOverlayRule_.style.justifyContent = 'center';
  this.cellOverlayRule_.style.margin = '5px';
  this.cellOverlayRule_.style.height = 'calc(100% - 10px)';
  this.cellOverlayRule_.style.width = 'calc(100% - 10px)';
  this.cellOverlayRule_.style.fontSize = '20vmin';
  this.cellOverlayRule_.style.fontWeight = 'bold';
  this.cellOverlayRule_.style.backgroundColor = 'rgb(255,255,255)';
  this.cellOverlayRule_.style.color = 'rgb(189,21,80)';
  this.cellOverlayRule_.style.borderRadius = '15px';
  this.cellOverlayRule_.style.opacity = 0.0;

  // Back side

  style.sheet.insertRule('babyStatsDisplayChildName {}', 0);
  var displayChildName = style.sheet.cssRules[0];
  displayChildName.style.fontSize = '5vw';
  displayChildName.style.fontWeight = 'bold';
  displayChildName.style.color = 'rgb(138,155,15)';
};


/**
 * Construct babyStateCell elements for insertion into the DOM.
 * @private
 */
BabyStats.prototype.buildCells_ = function() {
  this.cells_ = [];
  this.tiles_.forEach(function(tile) {
    var cell = document.createElement('babyStatsCell');
    this.cells_.push(cell);

    var contents = document.createElement('babyStatsCellContents');
    contents.textContent = tile.description;
    cell.appendChild(contents);

    tile.statusBox = document.createElement('babyStatsCellStatus');
    cell.appendChild(tile.statusBox);

    var overlay = document.createElement('babyStatsCellOverlay');
    cell.appendChild(overlay);

    cell.addEventListener('click', this.onClick_.bind(this, tile, overlay));
  }, this);
  window.setInterval(this.updateTileStatus_.bind(this), 60 * 1000);
};


/**
 * Handle a click event on a button.
 * @param {Object} tile tile description struct
 * @param {Element} overlay element to make visible with countdown timer
 * @private
 */
BabyStats.prototype.onClick_ = function(tile, overlay) {
  if (this.intervals_[tile.type]) {
    window.clearInterval(this.intervals_[tile.type]);
    delete this.intervals_[tile.type];
    overlay.style.opacity = 0.0;
    return;
  }
  var timer = 5;
  overlay.textContent = timer;
  overlay.style.opacity = 0.5;
  this.intervals_[tile.type] = window.setInterval(function() {
    timer--;
    switch (timer) {
      case 0:
        var types = tile.implies || [];
        types.push(tile.type);
        types.forEach(function(type) {
          this.chat_.sendMessage({
            type: type,
            sender_name: this.yourName_.value,
          });
        }.bind(this));
        overlay.textContent = '✓';
        break;

      case -1:
        break;

      case -2:
        window.clearInterval(this.intervals_[tile.type]);
        delete this.intervals_[tile.type];
        overlay.style.opacity = 0.0;
        break;

      default:
        overlay.textContent = timer;
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
  back.style.display = 'block';
  back.style.textAlign = 'center';
  back.style.padding = '15px';
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

  this.gridOverlay_ = document.createElement('babyStatsGridOverlay');
  front.appendChild(this.gridOverlay_);

  // Back (read-only) side
  this.displayChildName_ = document.createElement('babyStatsDisplayChildName');
  back.appendChild(this.displayChildName_);

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
 * @return {string}
 */
BabyStats.prototype.secondsToHuman_ = function(seconds) {
  if (seconds > 60 * 60 * 24) {
    return Math.floor(seconds / (60 * 60 * 24)).toString() + 'd';
  } else if (seconds > 60 * 60) {
    return Math.floor(seconds / (60 * 60)).toString() + 'h';
  } else {
    return Math.floor(seconds / 60).toString() + 'm';
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
      if (tile.canceled || timedOut) {
        this.removeCSSClass_(tile.statusBox, 'babyStatsCellStatusActive');
      } else {
        this.addCSSClass_(tile.statusBox, 'babyStatsCellStatusActive');
      }
    } else {
      this.removeCSSClass_(tile.statusBox, 'babyStatsCellStatusActive');
    }
  }.bind(this));

};
