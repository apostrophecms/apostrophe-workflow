## Status

Work in progress, not yet functional.

## Approach

For 2.x, the draft and live versions of a doc are completely separate docs as far as most of Apostrophe is concerned. A `workflowGuid` property ties them together. This greatly reduces the scope of changes required in the rest of Apostrophe and improves performance by removing the need to move content around on every page view or load content for locales you are not looking at.

As the term locale suggests, the 2.x workflow module is also intended to provide infrastructure for the 2.x localization module, which will further extend the concept of locales while following this same approach.

## TODO

* Direct attachments have to be copied, not cross-referenced, otherwise edits to them will unexpectedly be shared.
* "Reorganize" operations must be attended to, in particular the impact on path and rank must be propagated as part of the commit process.
* The trash must be refactored so that pages don't lose their context in the tree while they are considered trash in some locales. Trash is just one more toggle-able flag that might get propagated as part of the commit process.
