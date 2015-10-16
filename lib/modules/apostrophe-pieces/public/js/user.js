apos.define('apostrophe-pieces', {

  afterConstruct: function(self) {
    self.clickHandlers();
    self.defineTools();
  },

  construct: function(self, options) {

    self.options = options;
    self.name = self.options.name;

    self.clickHandlers = function() {
      apos.ui.link('manage', self.name, function() {
        self.manage();
      });
      apos.ui.link('edit', self.name, function($button, _id) {
        self.edit(_id);
      });
      apos.ui.link('create', self.name, function($button) {
        self.create();
      });
      apos.on('findChooser', function(info) {
        self.findChooser(info);
      });
    };

    self.managerName = self.__meta.name + '-manager';
    self.editorName = self.__meta.name + '-editor';

    self.getToolOptions = function(extend) {
      var options = _.omit(self.options, 'construct', 'beforeConstruct', 'afterConstruct');
      _.extend(options, extend || {});
      return options;
    };

    self.manage = function() {
      apos.create(self.managerName, self.getToolOptions());
    };

    self.edit = function(_id) {
      apos.create(self.editorName, self.getToolOptions({ _id: _id }));
    };

    self.create = function() {
      apos.create(self.editorName, self.getToolOptions());
    };

    // If our inheritance tree looks like:
    //
    // pieces: events: nifty-events
    //
    // Then make sure that this tree also exists:
    //
    // pieces-manager: events-manager: nifty-events-manager
    //
    // The developer may then take advantage of moog's
    // implicit subclassing feature to extend any
    // of these.

    self.defineTools = function() {
      var tools = [ 'manager', 'editor' ];
      _.each(tools, function(tool) {
        apos.mirror(self.__meta, '-' + tool);
      });
    };

    self.findChooser = function(info) {
      if (info.field.withType !== self.name) {
        return;
      }
      info.chooser = self.choose;
    };

    self.choose = function(info, callback) {
      apos.create(self.managerName, self.getToolOptions({ choose: { data: info.data, field: info.field, save: callback } }));
    };

  }
});


