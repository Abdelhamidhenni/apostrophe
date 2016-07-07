
module.exports = {
  extend: 'apostrophe-pieces',
  alias: 'tags',
  name: 'tag',
  label: 'Tag',
  afterConstruct: function(self) {
    self.createRoutes();
  },
  construct: function(self, options) {

    require('./lib/api')(self, options);
    require('./lib/implementation')(self, options);
    require('./lib/routes')(self, options);
    require('./lib/browser')(self, options);

    self.addHelpers({
      menu: function() {
        return self.partial('menu', { options: options });
      }
    });
  }
}
