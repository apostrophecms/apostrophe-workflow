var _ = require('@sailshq/lodash');
var fs = require('fs');

module.exports = {
  improve: 'apostrophe-assets',
  afterConstruct: function(self) {
    self.workflowAddStylesheetRoutes();
  },
  construct: function(self, options) {
    var superStylesheetsHelper = self.stylesheetsHelper;
    self.workflowStylesheetCache = {};
    self.stylesheetsHelper = function(scene) {
      var result = '';
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
      // For performance reasons we need to run these "routes" before the middleware,
      // so push middleware of our own that implements them. The apostrophe-assets
      // module already sets up an `expressMiddleware` property scheduled to run
      // before `apostrophe-global`, which is what we want. -Tom
      self.expressMiddleware.middleware.push(function(req, res, next) {
        if (req.path === self.action + '/workflow-stylesheet') {
          return self.workflowStylesheet(req, res);
        } else if (req.path === self.action + '/workflow-default-stylesheet') {
          return self.workflowDefaultStylesheet(req, res);
        }
        return next();
      });
    };

    self.workflowStylesheet = function(req, res) {
      var workflow = self.apos.modules['apostrophe-workflow'];
      var locale = req.query.locale;
      if (!locale) {
        return req.res.status(404).send('not found');
      }
      locale = workflow.liveify(locale);
      var stylesheet = workflow.locales[locale] && workflow.locales[locale].stylesheet;
      return self.workflowSendStylesheet(req, stylesheet);
    };

    self.workflowDefaultStylesheet = function(req, res) {
      var workflow = self.apos.modules['apostrophe-workflow'];
      var stylesheet = workflow.options.defaultStylesheet;
      return self.workflowSendStylesheet(req, stylesheet);
    };

    self.workflowSendStylesheet = function(req, stylesheet) {
      if (!stylesheet) {
        return req.res.status(404).send('not found');
      }
      var css = self.workflowStylesheetCache[stylesheet];
      if (!css) {
        var path = self.workflowGetStylesheetPath(stylesheet);
        if (!path) {
          self.apos.utils.error('stylesheet ' + stylesheet + ' was configured for workflow but does not exist in apostrophe-workflow project level');
          return req.res.status(404).send('not found');
        }

        css = fs.readFileSync(path, 'utf8');
        css = self.prefixCssUrlsWith(css, self.assetUrl(''));
        self.workflowStylesheetCache[stylesheet] = css;
      }
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
          path = _path;
          return false;
        }
      });
      return path;
    };

  }
};
