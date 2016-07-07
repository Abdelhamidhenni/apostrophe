apos.define('apostrophe-docs-chooser', {
  extend: 'apostrophe-context',
  beforeConstruct: function(self, options) {
    self.options = options;
    self.field = options.field;
    self.$el = options.$el;
    self.$el.data('aposChooser', self);
    if (self.field.type === 'joinByOne') {
      self.limit = 1;
    } else {
      self.limit = (self.field.hints && self.field.hints.limit) || self.field.limit;
    }
    // Our own module is not the right one to talk to for chooser templates
    // because the docs module delivers those. However on the server side you
    // can hook in to render them and the pieces module does do that. -Tom
    options.action = apos.docs.action;
    self.choices = [];
  },
  afterConstruct: function(self, callback) {
    return async.series([
      self.load
    ], function(err) {
      if (err) {
        return callback(err);
      }
      self.enableLinks();
      self.enableAutocomplete();
      return callback(null);
    });
  },
  construct: function(self, options) {
    self.load = function(callback) {
      var args = {};
      // browse button can be shut off, for instance if we're already appearing in
      // a manage modal in response to a browse button
      if (options.browse !== false) {
        args.browse = true;
      }
      if (options.autocomplete !== false) {
        args.autocomplete = true;
      }
      return self.html('chooser', args, function(html) {
        self.$el.html(html);
        self.$choices = self.$el.find('[data-choices]:first');
        self.set([]);
        return callback(null);
      }, function(err) {
        return callback(err);
      });
    };
    self.set = function(choices) {
      self.choices = choices;
      return self.refresh();
    };
    self.get = function(callback) {
      if (!self.refreshing) {
        return callback(null, self.choices);
      }
      setTimeout(function() {
        return self.get(callback);
      }, 50);
    };
    self.getFinal = function(callback) {
      return self.finalize(function(err) {
        if (err) {
          return callback(err);
        }
        return self.get(callback);
      });
    };
    self.finalize = function(callback) {
      // A hook to implement things like minimums, autocropping, etc.
      return setImmediate(callback);
    };
    self.add = function(_id) {
      if (self.choices.length >= self.limit) {
        return false;
      }
      self.choices.push({ value: _id });
      self.refresh();
      return true;
    };
    self.remove = function(_id) {
      self.choices = _.filter(self.choices, function(choice) {
        return choice.value !== _id;
      });
      self.refresh();
      return true;
    }
    self.refreshing = 0;
    self.last = [];
    self.refresh = function() {
      if (self.refreshing) {
        self.refreshing++;
        return;
      }
      self.refreshing++;
      self.$choices.html('');
      return self.html('chooser-choices', { choices: self.choices, field: self.field }, function(html) {
        self.$choices.html(html);
        self.decrementRefreshing();
        var compare = JSON.stringify(self.choices);
        if (self.last !== compare) {
          self.last = compare;
          self.onChange();
        }
      }, function(err) {
        self.decrementRefreshing();
      });
    };

    self.decrementRefreshing = function() {
      self.refreshing--;
      // If one or more additional refreshes have been requested, carrying out
      // one more is sufficient
      if (self.refreshing > 0) {
        self.refreshing = 0;
        self.refresh();
      }
    };

    self.enableLinks = function() {
      self.link('apos-delete', 'item', function($button, _id) {
        self.remove(_id);
      });
      self.link('apos-raise', 'item', function($button, _id) {
        var index = _.findIndex(self.choices, { value: _id });
        if (index === -1) {
          return;
        }
        if (index === 0) {
          return;
        }
        var tmp = self.choices[index - 1];
        self.choices[index - 1] = self.choices[index];
        self.choices[index] = tmp;
        return self.refresh();
      });
      self.link('apos-lower', 'item', function($button, _id) {
        var index = _.findIndex(self.choices, { value: _id });
        if (index === -1) {
          return;
        }
        if (index === (self.choices.length - 1)) {
          return;
        }
        var tmp = self.choices[index + 1];
        self.choices[index + 1] = self.choices[index];
        self.choices[index] = tmp;
        return self.refresh();
      });
      self.link('apos-relate', 'item', function($button, _id) {
        var choice = _.find(self.choices, { value: _id });
        if (!choice) {
          return;
        }
        var editorType = self.field.relationshipEditor || apos.docs.getManager(self.field.withType).getToolType('relationship-editor');
        apos.create(editorType, {
          choice: choice,
          field: self.field,
          action: self.action,
          chooser: self
        });
      });
      self.link('apos-browse', function() {
        self.launchBrowser();
      });
    };

    self.enableAutocomplete = function() {
      self.$autocomplete = self.$el.find('[data-autocomplete]');
      self.$autocomplete.autocomplete({
        source: function(request, response) {
          return self.api('autocomplete', {
            term: request.term,
            field: self.field
          }, response);
        },
        minLength: 1,
        // Stomp out suggestions of choices already made
        response: function(event, ui) {
          var content = ui.content;
          var filtered = _.filter(content, function(datum) {
            return !_.find(self.choices, { value: datum.value });
          });
          // "Why don't you just assign to ui.content?" jquery.ui.autocomplete
          // is holding a reference to the original array. If I assign to ui.content
          // I'm not changing that original array and jquery.ui.autocomplete ignores me.
          content.length = 0;
          $.each(filtered, function(i, datum) {
            content.push(datum);
          });
        },
        focus: function(event, ui) {
          self.$autocomplete.val(ui.item.label);
          return false;
        },
        select: function(event, ui) {
          self.$autocomplete.val('');
          self.add(ui.item.value);
          return false;
        }
      });
    };
    self.getBrowserType = function() {
      return apos.docs.getManager(self.field.withType).getToolType('manager-modal');
    };

    self.launchBrowser = function() {
      return apos.docs.getManager(self.field.withType).getTool('manager-modal', {
        decorate: self.decorateManager,
        chooser: self,
        source: 'chooser',
        transition: 'slide'
      });
    };
    // Create a new chooser with the same data and options, merging in any
    // additional options from the first argument. Async because
    // the constructor is async. Delivers (err, newChooser)
    self.clone = function(options, callback) {
      var _options = {};
      _.assign(_options, self.options);
      _.assign(_options, options);
      return apos.create(self.__meta.name, _options, function(err, chooser) {
        if (err) {
          return callback(err);
        }
        return self.get(function(err, data) {
          if (err) {
            return callback(err);
          }
          chooser.set(data);
          return callback(null, chooser);
        });
      });
    };
    self.onChange = function() {
      if (self.limit && self.choices.length >= self.limit) {
        self.$el.addClass('apos-chooser-full');
        self.$autocomplete.prop('disabled', true);
      } else {
        self.$el.removeClass('apos-chooser-full');
        self.$autocomplete.prop('disabled', false);
      }
      if (self.options.change) {
        self.options.change();
      }
    };

    self.decorateManager = function(manager, options) {
      manager.parentChooser = options.chooser;

      // TODO make this actually detect changes properly
      manager.unsavedChanges = true;

      var superBeforeShow = manager.beforeShow;
      manager.beforeShow = function(callback) {
        return superBeforeShow(function() {
          return manager.enableChooser(callback);
        });
      };

      manager.enableChooser = function(callback) {
        if (!manager.parentChooser) {
          return setImmediate(callback);
        }
        manager.enableCheckboxEventsForChooser();
        return manager.parentChooser.clone(
          { $el: manager.$el.find('[data-chooser]'), browse: false, autocomplete: false, change: manager.reflectChooserInCheckboxes },
          function(err, chooser) {
            if (err) {
              return callback(err);
            }
            manager.chooser = chooser;
            return callback(null);
          }
        );
      };

      manager.reflectChooserInCheckboxes = function() {
        if (!manager.chooser) {
          return;
        }
        return manager.chooser.get(function(err, choices) {
          if (err) {
            return;
          }
          manager.$el.find('[data-piece] input[type="checkbox"]').each(function() {
            var $box = $(this);
            var id = $box.closest('[data-piece]').attr('data-piece');
            $box.prop('checked', !!_.find(choices, { value: id }));
          });
        });
      };

      manager.enableCheckboxEventsForChooser = function() {
        manager.$el.on('change', '[data-piece] input[type="checkbox"]', function(e) {
          // in rare circumstances, might not be ready yet, don't crash
          if (!manager.chooser) {
            return;
          }
          var $box = $(this);
          var method = $box.prop('checked') ? manager.chooser.add : manager.chooser.remove;
          if (!method($box.closest('[data-piece]').attr('data-piece'))) {
            // If the operation could not be completed, change back the state
            // of the checkbox.
            $box.prop('checked', function(index, value) {
              return !value;
            });
          }
        });
      };

      manager.saveContent = function(callback) {
        if (!manager.chooser) {
          // This should not happen, but be graceful
          return callback(null);
        }
        // Pass our choices back to the chooser hanging out in a schema form that
        // initially triggered us via "browse"
        return manager.chooser.get(function(err, choices) {
          if (err) {
            return callback(err);
          }
          manager.parentChooser.set(choices);
          return callback(null);
        });
      };

      var superManagerSave = manager.save;
      manager.save = function(callback) {
        return superManagerSave(function(err) {
          if (err) {
            return callback && callback(err);
          }
          manager.parentChooser.afterManagerSave();
          return callback && callback(null);
        });
      };

      var superManagerCancel = manager.cancel;
      manager.cancel = function(callback) {
        return superManagerCancel(function(err) {
          if (err) {
            return callback && callback(err);
          }
          manager.parentChooser.afterManagerCancel();
          return callback && callback(null);
        });
      };

      manager.getConfirmCancelText = function() {
        return 'Are you sure you want to discard unsaved changes to this selection of '
          + options.pluralLabel.toLowerCase() + '?';
      }

      manager.beforeList = function(listOptions) {
        // The `limit` hint would break normal pagination in the manage view; the
        // chooser handles that one on its own. -Tom
        _.extend(listOptions, _.omit(self.field.hints, 'limit'), { chooser: true });
      };

      manager.afterRefresh = function() {
        manager.reflectChooserInCheckboxes();
      };
    };
    self.afterManagerSave = function() {};
    self.afterManagerCancel = function() {};
  }
});
