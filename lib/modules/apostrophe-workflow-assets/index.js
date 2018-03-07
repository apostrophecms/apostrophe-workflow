var _ = require('lodash');
var fs = require('fs');

module.exports = {
  improve: 'apostrophe-assets',
  afterConstruct: function(self) {
    self.workflowAddStylesheetRoutes();
  },
  construct: function(self, options) {
    var superStylesheetsHelper = self.stylesheetsHelper;
    self.stylesheetsHelper = function(scene) {
      var result;
      var workflow = self.apos.modules['apostrophe-workflow'];
      var locale = self.apos.templates.contextReq.locale;
      locale = workflow.liveify(locale);
      var prefix = self.apos.prefix + self.action;
      if (workflow.locales[locale].stylesheet) {
        result = '<link href="' + prefix + '/workflow-stylesheet?locale=' + locale + '&generation=' + self.generation + '" rel="stylesheet" />';
      } else if (workflow.options.defaultStylesheet) {
        result = '<link href="' + prefix + '/workflow-default-stylesheet" rel="stylesheet" />';
      }
      return self.apos.templates.safe(result + superStylesheetsHelper(scene).toString());
    };

    self.workflowAddStylesheetRoutes = function() {
      self.route('get', 'workflow-stylesheet', function(req, res) {
        var workflow = self.apos.modules['apostrophe-workflow'];
        var locale = req.query.locale;
        if (!locale) {
          return req.res.status(404).send('not found');
        }
        locale = workflow.liveify(locale);
        var stylesheet = workflow.locales[locale] && workflow.locales[locale].stylesheet;
        return self.workflowSendStylesheet(req, stylesheet);
      });
      self.route('get', 'workflow-default-stylesheet', function(req, res) {
        var workflow = self.apos.modules['apostrophe-workflow'];
        var stylesheet = workflow.options.defaultStylesheet;
        return self.workflowSendStylesheet(req, stylesheet);
      });
    };

    self.workflowSendStylesheet = function(req, stylesheet) {
      if (!stylesheet) {
        return req.res.status(404).send('not found');
      }

      var path = self.workflowGetStylesheetPath(stylesheet);
      if (!path) {
        self.apos.utils.error('stylesheet ' + stylesheet + ' was configured for workflow but does not exist in apostrophe-workflow project level');
        return req.res.status(404).send('not found');
      }

      var css = fs.readFileSync(path, 'utf8');
      css = self.prefixCssUrlsWith(css, self.assetUrl(''));
      req.res.set('Content-Type', 'text/css');
      return req.res.send(css);
    };

    self.workflowGetStylesheetPath = function(stylesheet) {
      var workflow = self.apos.modules['apostrophe-workflow'];
      var chain = workflow.__meta.chain;
      var path;
      _.each(chain, function(entry) {
        var _path = entry.dirname + '/public/css/' + stylesheet;
        if (!_path.match(/\.\w+$/)) {
          _path += '.css';
        }
        if (fs.existsSync(_path)) {
          path = require('path').resolve(_path);
          return false;
        }
      });
      return path;
    };

  }
};
