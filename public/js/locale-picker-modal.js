// A very simple modal for switching locales. Used as admin UI, for the public
// one more typically builds a custom locale picker that suits the site design

apos.define('apostrophe-workflow-locale-picker-modal', {
  extend: 'apostrophe-modal',
  source: 'locale-picker-modal'
  // All the business logic is in the route and template, which contains
  // ordinary links that switch locales by navigating
});
