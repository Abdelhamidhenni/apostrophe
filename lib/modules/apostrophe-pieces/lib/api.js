
var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var mkdirp = require('mkdirp');

module.exports = function(self, options) {

  self.find = function(req, criteria, projection) {
    var cursor = self.apos.docs.find(req, criteria, projection);
    require('./cursor.js')(self, cursor);
    return cursor;
  };

  // middleware for JSON API routes that expect the ID of
  // an existing piece at req.body._id
  self.requirePiece = function(req, res, next) {
    var id = self.apos.launder.id(req.body._id);

    return self.find(req, { _id: id })
      .permission('edit')
      .published(null)
      .toObject(function(err, _piece) {
        if (err) {
          return self.apiResponse(res, err);
        }
        if (!_piece) {
          return self.apiResponse(res, 'notfound');
        }
        req.piece = _piece;
        return next();
      }
    );
  };

  // User must have some editing privileges for this type
  self.requireEditor = function(req, res, next) {
    if (!req.user) {
      return self.apiResponse(res, 'forbidden');
    }
    if (!self.apos.permissions.can(req, 'edit-' + self.name)) {
      return self.apiResponse(res, 'forbidden');
    }
    return next();
  };

  self.list = function(req, filters, callback) {
    var cursor = self.find(req)
      .published(null)
      .perPage(self.options.perPage || 10)
      .queryToFilters(filters);
    var results = {};
    return async.series({
      toCount: function(callback) {
        return cursor
          .toCount(function(err, count) {
            if (err) {
              return callback(err);
            }
            results.total = count;
            results.totalPages = cursor.get('totalPages');
            return callback(null);
          }
        );
      },
      toArray: function(callback) {
        return cursor
          .toArray(function(err, pieces) {
            if (err) {
              return callback(err);
            }
            results.skip = cursor.get('skip');
            results.limit = cursor.get('limit');
            results.page = cursor.get('page');
            results.pieces = pieces;
            return callback(null);
          }
        );
      }
    }, function(err) {
      if (err) {
        return callback(err);
      }
      // Helps the frontend display the active sort and filter states
      results.cursor = cursor;
      return callback(null, results);
    });
  };

  self.insert = function(req, piece, callback) {
    piece.type = self.name;
    self.apos.docs.insert(req, piece, callback);
  };

  self.update = function(req, piece, callback) {
    piece.type = self.name;
    self.apos.docs.update(req, piece, callback);
  };

  self.trash = function(req, id, callback) {
    self.apos.docs.trash(req, id, function(err, piece) {
      return callback(err);
    });
  };

  self.rescue = function(req, id, callback) {
    self.apos.docs.rescue(req, id, function(err, piece) {
      return callback(err);
    });
  };

  self.convert = function(req, piece, callback) {
    return self.apos.schemas.convert(req, self.schema, 'form', req.body, piece, callback);
  };

  self.findIfContextual = function(req, piece, callback) {
    if (!self.contextual) {
      return setImmediate(callback);
    }
    return self.find(req, { _id: piece._id })
      .permission('edit')
      .published(null)
      .toObject(function(err, _piece) {
        if (err) {
          return callback(err);
        }
        if (!_piece) {
          return callback('notfound');
        }
        _.assign(piece, _piece);
        return callback(null);
      }
    );
  };

  self.afterConvert = function(req, piece, callback) {
    return setImmediate(callback);
  };

  self.beforeCreate = function(req, piece, callback) {
    return setImmediate(callback);
  };

  self.beforeSave = function(req, piece, callback) {
    return setImmediate(callback);
  };

  self.afterCreate = function(req, piece, callback) {
    return setImmediate(callback);
  };

  self.afterSave = function(req, piece, callback) {
    return setImmediate(callback);
  };

  self.beforeUpdate = function(req, piece, callback) {
    return setImmediate(callback);
  };

  self.afterUpdate = function(req, piece, callback) {
    return setImmediate(callback);
  };

  self.beforeTrash = function(req, id, callback) {
    return setImmediate(callback);
  };

  self.afterTrash = function(req, id, callback) {
    return setImmediate(callback);
  };

  self.beforeRescue = function(req, id, callback) {
    return setImmediate(callback);
  };

  self.afterRescue = function(req, id, callback) {
    return setImmediate(callback);
  };

  self.beforeList = function(req, filters, callback) {
    return setImmediate(callback);
  };

  self.afterList = function(req, results, callback) {
    return setImmediate(callback);
  };

  self.apiResponse = function(res, err, data) {
    if (err) {
      if (typeof(err) !== 'string') {
        err = 'error';
      }
      return res.send({ status: err });
    } else {
      return res.send({ status: 'ok', data: data });
    }
  };

  self.insertResponse = function(req, res, err, data) {
    return self.apiResponse(res, err, data);
  };

  self.updateResponse = function(req, res, err, data) {
    return self.apiResponse(res, err, data);
  };

  self.retrieveResponse = function(req, res, err, data) {
    return self.apiResponse(res, err, data);
  };

  self.listResponse = function(req, res, err, data) {
    return self.apiResponse(res, err, data);
  };

  self.trashResponse = function(req, res, err, data) {
    return self.apiResponse(res, err, data);
  };

  self.rescueResponse = function(req, res, err, data) {
    return self.apiResponse(res, err, data);
  };

  self.composeSchema = function() {
    // inherit from the generic docs schema
    self.schema = self.apos.schemas.refine(self.apos.docs.schema, options);
  };

  self.composeFilters = function() {
    self.filters = options.filters || [];
    if (options.addFilters) {
      _.each(options.addFilters, function(newFilter) {
        // remove it from the filters if we've already added it, last one wins
        self.filters = _.filter(self.filters, function(filter) {
          return filter.name !== newFilter.name;
        });
        // add the new field to the filters
        self.filters.push(newFilter);
      });
    }
    if (options.removeFilters) {
      self.filters = _.filter(self.filters, function(filter) {
        return !_.contains(options.removeFilters, filter.name);
      });
    }
  };

  self.composeColumns = function() {
    self.columns = options.columns || [];
    if (options.addColumns) {
      _.each(options.addColumns, function(newColumn) {
        // remove it from the columns if we've already added it, last one wins
        self.columns = _.filter(self.columns, function(column) {
          return column.name !== newColumn.name;
        });
        // add the new field to the columns
        self.columns.push(newColumn);
      });
    }
    if (options.removeColumns) {
      self.columns = _.filter(self.columns, function(column) {
        return !_.contains(options.removeColumns, column.name);
      });
    }
  };

  self.generateScaffolding = function(callback) {
    var req = self.apos.tasks.getReq();
    return async.series({
      mkdir: function(callback) {
        return mkdirp(self.editorViews, callback);
      },
      scaffoldEditor: function(callback) {
        return scaffoldTemplate('editor', callback)
      },
      scaffoldCreate: function(callback) {
        return scaffoldTemplate('create', callback);
      }
    }, function(err) {
      if (err) {
        console.log(err);
      }
      return callback(err);
    });

    function scaffoldTemplate(template, callback) {
      var path = self.editorViews + '/' + template + '.html';
      console.log('Writing ' + path + ' ...');
      return fs.writeFile(path,
        self.render(req, template, { options: self.options, schema: self.schema }),
        callback);
    }
  };

  self.addTasks = function() {
    self.apos.tasks.add(self.__meta.name, 'generate-scaffolding',
     'Usage: Experimental',
     function(apos, argv, callback) {
       return self.generateScaffolding(callback);
     }
   );
 };
};
