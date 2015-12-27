var BabyStats = function(container) {
  this.container_ = container;

  this.tileScaleHeight_ = 1;
  this.tileScaleWidth_ = 1;

  this.tiles_ = [
    ['asleep', 'Asleep'],
    ['awake', 'Awake'],
    ['diaper_feces', 'Diaper change\n(feces)'],
    ['diaper_urine', 'Diaper change\n(urine only)'],
    ['feeding_breast', 'Feeding\n(breast)'],
    ['feeding_bottle_milk', 'Feeding\n(bottled breast milk)'],
    ['feeding_formula', 'Feeding\n(formula)'],
  ];

  this.intervals_ = {};

  this.buildCells_();
  this.buildStylesheet_();
  var grid = this.calculateGrid_();
  this.gridWidthCells_ = grid.gridWidthCells;
  this.gridHeightCells_ = grid.gridHeightCells;
  this.buildGrid_();
};

/**
 * Add a CSS class to a node if it doesn't already have it.
 * @param {!Node} node Node object to add class to
 * @param {!string} className Name of class to add
 * @private
 */
BabyStats.prototype.addCSSClass_ = function(node, className) {
  var classes = node.className.split(' ').filter(function(className) { return className; });
  if (classes.indexOf(className) != -1) {
    // Already has class.
    return;
  }
  classes.push(className);
  node.className = classes.join(' ');
}

/**
 * Construct our stylesheet and insert it into the DOM.
 * @private
 */
BabyStats.prototype.buildStylesheet_ = function() {
  // http://www.colourlovers.com/palette/848743/(%E2%97%95_%E2%80%9D_%E2%97%95)
  var style = document.createElement('style');
  document.head.appendChild(style);

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
  this.cellRule_.style.cursor = 'default';

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
  var contents = style.sheet.cssRules[0];
  contents.style.display = 'flex';
  contents.style.position = 'absolute';
  contents.style.alignItems = 'center';
  contents.style.justifyContent = 'center';
  contents.style.margin = '5px';
  contents.style.height = 'calc(100% - 10px)';
  contents.style.width = 'calc(100% - 10px)';
  contents.style.fontSize = '20vmin';
  contents.style.fontWeight = 'bold';
  contents.style.backgroundColor = 'rgb(255,255,255)';
  contents.style.color = 'rgb(189,21,80)';
  contents.style.borderRadius = '15px';
  contents.style.opacity = 0.0;
  contents.style.transition = '0.4s';

  style.sheet.insertRule('.babyStatsContainer {}', 0);
  var containerRule = style.sheet.cssRules[0];
  containerRule.style.backgroundColor = 'white';

  this.addCSSClass_(this.container_, 'babyStatsContainer');
};

/**
 * Construct cameraGridCell options for insertion into the DOM.
 * @private
 */
BabyStats.prototype.buildCells_ = function() {
  this.cells_ = [];
  this.tiles_.forEach(function(tiles) {
    var cell = document.createElement('babyStatsCell');
    this.cells_.push(cell);

    var contents = document.createElement('babyStatsCellContents');
    contents.textContent = tiles[1];
    cell.appendChild(contents);

    var overlay = document.createElement('babyStatsCellOverlay');
    cell.appendChild(overlay);

    cell.addEventListener('click', this.onClick_.bind(this, tiles[0], overlay));
  }, this);
};

BabyStats.prototype.onClick_ = function(eventName, overlay) {
  if (this.intervals_[eventName]) {
    window.clearInterval(this.intervals_[eventName]);
    delete this.intervals_[eventName];
    overlay.style.opacity = 0.0;
    return;
  }
  var timer = 5;
  overlay.textContent = timer;
  overlay.style.opacity = 0.5;
  this.intervals_[eventName] = window.setInterval(function() {
    timer--;
    switch (timer) {
      case 0:
        // XXX: send
        overlay.textContent = '✓';
        break;

      case -1:
        break;

      case -2:
        window.clearInterval(this.intervals_[eventName]);
        delete this.intervals_[eventName];
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
 * maximize the size of all video feeds while preserving their aspect ratios.
 * @return {{
 *   gridWidthCells: number,
 *   gridHeightCells: number,
 *   cellWidthPx: number,
 *   cellHeightPx: number
 * }}
 * @private
 */
BabyStats.prototype.calculateGrid_ = function() {
  var containerWidth = this.container_.offsetWidth;
  var containerHeight = this.container_.offsetHeight;
  var numTiles = this.tiles_.length;

  var scaleFactor = ((containerHeight / this.tileScaleHeight_)
                     / (containerWidth / this.tileScaleWidth_));

  var gridHeight = Math.sqrt(scaleFactor * numTiles);
  var gridWidth = Math.sqrt(numTiles / scaleFactor);

  var gridOptions = [
    [ Math.ceil(gridWidth), Math.floor(gridHeight) ],
    [ Math.floor(gridWidth), Math.ceil(gridHeight) ],
    [ Math.ceil(gridWidth), Math.ceil(gridHeight) ],
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
 * Construct the grid objects in the DOM.
 * @private
 */
BabyStats.prototype.buildGrid_ = function() {
  this.container_.innerHTML = '';

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
    this.container_.appendChild(row);
  }
};
