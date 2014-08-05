var _ = require('lodash');
var async = require('async');
var moment = require('moment');

module.exports = workflow;

function workflow(options, callback) {
  return new workflow.Construct(options, callback);
}

workflow.Construct = function(options, callback) {
  var self = this;

  // "Protected" properties. We want related modules and subclasses to be able
  // to access these, thus no variables defined in the closure
  self._apos = options.apos;
  self._app = options.app;
  self._options = options;

  self.redirects = self._apos.redirects;

  self._apos.mixinModuleAssets(self, 'workflow', __dirname, options);

  self._action = '/apos-workflow';

  self.deliver = function(res, err, result) {
    if (err) {
      console.log(err);
      return res.send({
        status: 'failed'
      });
    }
    var response = { 'status': 'ok' };
    if (result !== undefined) {
      response.result = result;
    }
    return res.send(response);
  };

  // Fetch the whole list to initialize the editor

  self._app.get(options.loadUrl || self._action + '/load', function(req, res) {
    return self._apos.get(req,
      { submitDraft: { $exists: 1 } },
      {
        fields: { slug: 1, submitDraft: 1, draftSubmittedBy: 1 },
        permission: 'publish-page',
        sort: { submitDraft: -1 }
      },
      function(err, results) {
        if (err) {
          console.error(err);
          return res.send({ status: 'error' });
        }
        return res.send({ status: 'ok', count: results.total, html: self.render('managerPages', { pages: results.pages }) });
      }
    );
  });

  // The UI for switching between draft and public and requesting approval
  self._apos.pushGlobalCallWhen('user', 'window.aposWorkflow = new AposWorkflow()');
  // The UI for the manage dialog that shows you what needs approval
  self._apos.pushGlobalCallWhen('user', 'window.aposWorkflowManager = new AposWorkflowManager()');

  self.pushAsset('script', 'editor', { when: 'user' });
  self.pushAsset('stylesheet', 'editor', { when: 'user' });
  self.pushAsset('template', 'manager', { when: 'user' });

  self._apos.addLocal('aposWorkflowMenu', function(options) {
    return self.render('menu', options || {});
  });

  self._apos.addLocal('aposWorkflowManagerMenu', function(options) {
    return self.render('managerMenu', options || {});
  });

  if (callback) {
    // Invoke callback on next tick so that the constructor's return
    // value can be assigned to a variable in the same closure where
    // the callback resides
    process.nextTick(function() { return callback(null); });
  }
};

