// A modal for forcing export of a single widget to other locales

apos.define('apostrophe-workflow-force-export-widget-modal', {

  extend: 'apostrophe-workflow-export-modal',

  source: 'force-export-widget-modal',
  
  verb: 'force-export-widget',
  
  // The base class already sends everything in options.body so no
  // further modifications are needed on the front end so far

});
