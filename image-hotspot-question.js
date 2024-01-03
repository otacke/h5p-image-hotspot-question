/*global H5P*/
H5P.ImageHotspotQuestionNOTENO = (function ($, Question) {

  /**
   * Initialize module.
   *
   * @class H5P.ImageHotspotQuestion
   * @extends H5P.Question
   * @param {Object} params Behavior settings
   * @param {number} id Content identification
   * @param {Object} contentData Task specific content data
   */
  function ImageHotspotQuestionNOTENO(params, id, contentData) {
    var self = this;

    var defaults = {
      imageHotspotQuestionNoteNo: {
        backgroundImageSettings: {
          backgroundImage: {
            path: ''
          }
        },
        hotspotSettings: {
          hotspot: [],
          showFeedbackAsPopup: true,
          l10n: {
            retryText: 'Retry',
            closeText: 'Close'
          }
        }
      },
      behaviour: {
        enableRetry: true
      },
      scoreBarLabel: 'You got :num out of :total points',
      a11yRetry: 'Retry the task. Reset all responses and start the task over again.',
    };

    // Inheritance
    Question.call(self, 'image-hotspot-question');

    /**
     * Keeps track of content id.
     * @type {number}
     */
    this.contentId = id;

    /**
     * Keeps track of current score.
     * @type {number}
     */
    this.score = 0;

    /**
     * Keeps track of max score.
     * @type {number}
     */
    this.maxScore = 1;

    /**
     * Keeps track of parameters
     */
    this.params = $.extend(true, {}, defaults, params);

    /**
     * Easier access to image settings.
     * H5P semantics doesn't treat Arrays with one element as arrays with one element
     */
    this.imageSettings = this.params.imageHotspotQuestion.backgroundImageSettings;

    /**
     * Easier access to hotspot settings.
     */
    this.hotspotSettings = this.params.imageHotspotQuestion.hotspotSettings;

    /**
     * Hotspot feedback object. Contains hotspot feedback specific parameters.
     * @type {Object}
     */
    this.hotspotFeedback = {
      hotspotChosen: false
    };

    /**
     * Keeps track of all hotspots in an array.
     * @type {Array}
     */
    this.$hotspots = [];

    /**
     * Keeps track of the content data. Specifically the previous state.
     * @type {Object}
     */
    this.contentData = contentData;
    if (contentData !== undefined && contentData.previousState !== undefined) {
      this.previousState = contentData.previousState;
    }

    // Start activity timer
    if (this.isRoot()) {
      this.setActivityStarted();
    }

    // Register resize listener with h5p
    this.on('resize', this.resize);
  }

  // Inheritance
  ImageHotspotQuestionNOTENO.prototype = Object.create(Question.prototype);
  ImageHotspotQuestionNOTENO.prototype.constructor = ImageHotspotQuestionNOTENO;

  /**
   * Registers this question types DOM elements before they are attached.
   * Called from H5P.Question.
   */
  ImageHotspotQuestionNOTENO.prototype.registerDomElements = function () {

    const introduction = document.createElement('div');
    introduction.classList.add('h5p-image-hotspot-question-introduction');

    if (this.hotspotSettings.taskDescription) {

      const text = document.createElement('div');
      text.classList.add('h5p-image-hotspot-question-introduction-text');
      text.innerHTML = this.hotspotSettings.taskDescription;

      const textWrapper = document.createElement('div');
      textWrapper.classList.add('h5p-image-hotspot-question-introduction-text-wrapper');
      textWrapper.append(text);
      introduction.append(textWrapper);
    }

    if (this.hotspotSettings.taskDescriptionAudio?.audio?.params?.files?.length) {
      const params = this.hotspotSettings.taskDescriptionAudio.audio;
      params.params.fitToWrapper = true;
      if (
        params.params.playerMode !== 'minimalistic' &&
        params.params.playerMode !== 'full'
      ) {
        params.params.playerMode = 'full'
      }

      const instance = H5P.newRunnable(params, this.contentId, undefined, true);

      if (instance) {
        const audio = document.createElement('div');
        audio.classList.add('h5p-image-hotspot-question-introduction-audio');
        audio.classList.add(params.params.playerMode);

        instance.attach(H5P.jQuery(audio));

        const audioPlayer = audio.querySelector('.h5p-audio');
        if (audioPlayer) {
          audioPlayer.style.height = (
            !!window.chrome && params.params.playerMode === 'full'
          ) ?
            '54px' : // Chromium based browsers like Chrome, Edge or Opera need explicit default height
            '100%';
        }

        introduction.classList.add(`audio-${params.params.playerMode}`);
        introduction.append(audio);
      }
    }

    this.setIntroduction(introduction);

    // Register task content area
    this.setContent(this.createContent());

    // Register retry button
    this.createRetryButton();
  };

  /**
   * Create wrapper and main content for question.
   * @returns {H5P.jQuery} Wrapper
   */
  ImageHotspotQuestionNOTENO.prototype.createContent = function () {
    var self = this;

    this.$wrapper = $('<div>', {
      'class': 'image-hotspot-question'
    });
    this.$wrapper.ready(function () {
      self.trigger('resize');
    });

    if (this.imageSettings && this.imageSettings.path) {
      this.$imageWrapper = $('<div>', {
        'class': 'image-wrapper'
      }).appendTo(this.$wrapper);

      // Image loader screen
      var $loader = $('<div>', {
        'class': 'image-loader'
      }).appendTo(this.$imageWrapper)
        .addClass('loading');

      this.$img = $('<img>', {
        'class': 'hotspot-image',
        'src': H5P.getPath(this.imageSettings.path, this.contentId)
      });

      // Resize image once loaded
      this.$img.on('load', function () {
        $loader.replaceWith(self.$img);
        self.trigger('resize');
      });

      this.attachHotspots();
      this.initImageClickListener();

    }
    else {
      const $message = $('<div>')
        .text('No background image was added!')
        .appendTo(this.$wrapper);
    }

    return this.$wrapper;
  };

  /**
   * Initiate image click listener to capture clicks outside of defined hotspots.
   */
  ImageHotspotQuestionNOTENO.prototype.initImageClickListener = function () {
    var self = this;

    this.$imageWrapper.click(function (mouseEvent) {
      // Create new hotspot feedback
      self.createHotspotFeedback($(this), mouseEvent);
    });
  };

  /**
   * Attaches all hotspots.
   */
  ImageHotspotQuestionNOTENO.prototype.attachHotspots = function () {
    var self = this;
    this.hotspotSettings.hotspot.forEach(function (hotspot) {
      self.attachHotspot(hotspot);
    });

  };

  /**
   * Attach single hotspot.
   * @param {Object} hotspot Hotspot parameters
   */
  ImageHotspotQuestionNOTENO.prototype.attachHotspot = function (hotspot) {
    var self = this;
    var $hotspot = $('<div>', {
      'class': 'image-hotspot ' + hotspot.computedSettings.figure
    }).css({
      left: hotspot.computedSettings.x + '%',
      top: hotspot.computedSettings.y + '%',
      width: hotspot.computedSettings.width + '%',
      height: hotspot.computedSettings.height + '%'
    }).click(function (mouseEvent) {

      // Create new hotspot feedback
      self.createHotspotFeedback($(this), mouseEvent, hotspot);

      // Do not propagate
      return false;


    }).appendTo(this.$imageWrapper);

    this.$hotspots.push($hotspot);
  };

  /**
   * Create a feedback element for a click.
   * @param {H5P.jQuery} $clickedElement The element that was clicked, a hotspot or the image wrapper.
   * @param {Object} mouseEvent Mouse event containing mouse offsets within clicked element.
   * @param {Object} hotspot Hotspot parameters.
   */
  ImageHotspotQuestionNOTENO.prototype.createHotspotFeedback = function ($clickedElement, mouseEvent, hotspot) {
    // Do not create new hotspot if one exists
    if (this.hotspotFeedback.hotspotChosen) {
      return;
    }

    this.hotspotFeedback.$element = $('<div>', {
      'class': 'hotspot-feedback'
    }).appendTo(this.$imageWrapper);

    this.hotspotFeedback.hotspotChosen = true;

    // Center hotspot feedback on mouse click with fallback for firefox
    var feedbackPosX = (mouseEvent.offsetX || mouseEvent.pageX - $(mouseEvent.target).offset().left);
    var feedbackPosY = (mouseEvent.offsetY || mouseEvent.pageY - $(mouseEvent.target).offset().top);

    // Apply clicked element offset if click was not in wrapper
    if (!$clickedElement.hasClass('image-wrapper')) {
      feedbackPosX += $clickedElement.position().left;
      feedbackPosY += $clickedElement.position().top;
    }

    // Keep position and pixel offsets for resizing
    this.hotspotFeedback.percentagePosX = feedbackPosX / (this.$imageWrapper.width() / 100);
    this.hotspotFeedback.percentagePosY = feedbackPosY / (this.$imageWrapper.height() / 100);
    this.hotspotFeedback.pixelOffsetX = (this.hotspotFeedback.$element.width() / 2);
    this.hotspotFeedback.pixelOffsetY = (this.hotspotFeedback.$element.height() / 2);

    // Position feedback
    this.resizeHotspotFeedback();

    // Style correct answers
    if (hotspot && hotspot.userSettings.correct) {
      this.hotspotFeedback.$element.addClass('correct');
      this.finishQuestion();
    } else {
      // Wrong answer, show retry button
      if (this.params.behaviour.enableRetry) {
        this.showButton('retry-button');
      }
    }

    var feedbackText = (hotspot && hotspot.userSettings.feedbackText ? hotspot.userSettings.feedbackText : this.params.imageHotspotQuestion.hotspotSettings.noneSelectedFeedback);
    if (!feedbackText) {
      feedbackText = '&nbsp;';
    }

    // Send these settings into setFeedback to turn feedback into a popup.
    var popupSettings = {
      showAsPopup: this.params.imageHotspotQuestion.hotspotSettings.showFeedbackAsPopup,
      closeText: this.params.imageHotspotQuestion.hotspotSettings.l10n.closeText,
      click: this.hotspotFeedback
    };

    this.setFeedback(feedbackText, this.score, this.maxScore, this.params.scoreBarLabel, undefined, popupSettings);

    // Finally add fade in animation to hotspot feedback
    this.hotspotFeedback.$element.addClass('fade-in');

    // Trigger xAPI completed event
    this.triggerAnswered();
  };

  /**
   * Create retry button and add it to button bar.
   */
  ImageHotspotQuestionNOTENO.prototype.createRetryButton = function () {
    var self = this;

    this.addButton('retry-button', this.params.imageHotspotQuestion.hotspotSettings.l10n.retryText, function () {
      self.resetTask();
    }, false, {
      'aria-label': this.params.a11yRetry,
    });
  };

  /**
   * Finish question and remove retry button.
   */
  ImageHotspotQuestionNOTENO.prototype.finishQuestion = function () {
    this.score = 1;
    // Remove button
    this.hideButton('retry-button');
  };

  /**
   * Checks if an answer for this question has been given.
   * Used in contracts.
   * @returns {boolean}
   */
  ImageHotspotQuestionNOTENO.prototype.getAnswerGiven = function () {
    return this.hotspotFeedback.hotspotChosen;
  };

  /**
   * Gets the current user score for this question.
   * Used in contracts
   * @returns {number}
   */
  ImageHotspotQuestionNOTENO.prototype.getScore = function () {
    return this.score;
  };

  ImageHotspotQuestionNOTENO.prototype.getTitle = function () {
    return H5P.createTitle((this.contentData.metadata && this.contentData.metadata.title) ? this.contentData.metadata.title : 'Fill In');
  };

  /**
   * Gets the max score for this question.
   * Used in contracts.
   * @returns {number}
   */
  ImageHotspotQuestionNOTENO.prototype.getMaxScore = function () {
    return this.maxScore;
  };

  /**
   * Trigger xAPI answered event
   */
  ImageHotspotQuestionNOTENO.prototype.triggerAnswered = function () {
    var self = this;
    var xAPIEvent = self.createXAPIEventTemplate('answered');

    // Add score to xAPIEvent
    const score = self.getScore();
    const maxScore = self.getMaxScore();
    xAPIEvent.setScoredResult(score, maxScore, self, true, score === maxScore);

    self.addQuestionToXAPI(xAPIEvent);
    self.trigger(xAPIEvent);
  };

  /**
   * Get xAPI data.
   * Contract used by report rendering engine.
   *
   * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-6}
   */
  ImageHotspotQuestionNOTENO.prototype.getXAPIData = function () {
    var self = this;
    var xAPIEvent = self.createXAPIEventTemplate('answered');
    xAPIEvent.setScoredResult(self.getScore(), self.getMaxScore(), self, true, true);
    self.addQuestionToXAPI(xAPIEvent);
    return {
      statement: xAPIEvent.data.statement
    };
  };

  /**
   * Add the question itselt to the definition part of an xAPIEvent
   */
  ImageHotspotQuestionNOTENO.prototype.addQuestionToXAPI = function (xAPIEvent) {
    var definition = xAPIEvent.getVerifiedStatementValue(['object', 'definition']);
    $.extend(true, definition, this.getxAPIDefinition());
  };

  /**
   * Generate xAPI object definition used in xAPI statements.
   * @return {Object}
   */
  ImageHotspotQuestionNOTENO.prototype.getxAPIDefinition = function () {
    // Individual report not supported
    if (this.isRoot()) {
      return;
    }
    var definition = {};
    definition.description = {
      'en-US': this.getTitle()
    };
    definition.type = 'http://adlnet.gov/expapi/activities/cmi.interaction';
    definition.interactionType = 'other';
    return definition;
  };

  /**
   * Display the first found solution for this question.
   * Used in contracts
   */
  ImageHotspotQuestionNOTENO.prototype.showSolutions = function () {
    var self = this;
    var foundSolution = false;

    this.hotspotSettings.hotspot.forEach(function (hotspot, index) {
      if (hotspot.userSettings.correct && !foundSolution) {
        var $correctHotspot = self.$hotspots[index];
        self.createHotspotFeedback($correctHotspot, {offsetX: ($correctHotspot.width() / 2), offsetY: ($correctHotspot.height() / 2)}, hotspot);
        foundSolution = true;
      }
    });
  };

  /**
   * Resets the question.
   * Used in contracts.
   */
  ImageHotspotQuestionNOTENO.prototype.resetTask = function () {
    // Remove hotspot feedback
    if (this.hotspotFeedback.$element) {
      this.hotspotFeedback.$element.remove();
    }
    this.hotspotFeedback.hotspotChosen = false;

    // Hide retry button
    this.hideButton('retry-button');

    // Clear feedback
    this.removeFeedback();
  };

  /**
   * Resize image and wrapper
   */
  ImageHotspotQuestionNOTENO.prototype.resize = function () {
    this.resizeImage();
    this.resizeHotspotFeedback();
  };

  /**
   * Resize image to fit parent width.
   */
  ImageHotspotQuestionNOTENO.prototype.resizeImage = function () {
    var self = this;

    // Check that question has been attached
    if (!(this.$wrapper && this.$img)) {
      return;
    }

    // Resize image to fit new container width.
    var parentWidth = this.$wrapper.width();
    this.$img.width(parentWidth);

    // Find required height for new width.
    var naturalWidth = this.$img.get(0).naturalWidth;
    var naturalHeight = this.$img.get(0).naturalHeight;
    var imageRatio = naturalHeight / naturalWidth;
    var neededHeight = -1;
    if (parentWidth < naturalWidth) {
      // Scale image down
      neededHeight = parentWidth * imageRatio;
    } else {
      // Scale image to natural size
      this.$img.width(naturalWidth);
      neededHeight = naturalHeight;
    }

    if (neededHeight !== -1) {
      this.$img.height(neededHeight);

      // Resize wrapper to match image.
      self.$wrapper.height(neededHeight);
    }
  };

  /**
   * Re-position hotspot feedback.
   */
  ImageHotspotQuestionNOTENO.prototype.resizeHotspotFeedback = function () {
    // Check that hotspot is chosen
    if (!this.hotspotFeedback.hotspotChosen) {
      return;
    }

    // Calculate positions
    var posX = (this.hotspotFeedback.percentagePosX * (this.$imageWrapper.width() / 100)) - this.hotspotFeedback.pixelOffsetX;
    var posY = (this.hotspotFeedback.percentagePosY * (this.$imageWrapper.height() / 100)) - this.hotspotFeedback.pixelOffsetY;

    // Apply new positions
    this.hotspotFeedback.$element.css({
      left: posX,
      top: posY
    });
  };

  return ImageHotspotQuestionNOTENO;
}(H5P.jQuery, H5P.Question));
