## Status

Work in progress, not yet functional.

## Approach

For 2.x, the draft and live versions of a doc are completely separate docs as far as most of Apostrophe is concerned. A `workflowGuid` property ties them together. This greatly reduces the scope of changes required in the rest of Apostrophe and improves performance by removing the need to move content around on every page view or load content for locales you are not looking at.

As the term locale suggests, the 2.x workflow module is also intended to provide infrastructure for the 2.x localization module, which will further extend the concept of locales while following this same approach.

## TODO

* Direct attachments have to be copied, not cross-referenced, otherwise edits to them will unexpectedly be shared.
* "Reorganize" operations must be attended to, in particular the impact on path and rank must be propagated as part of the commit process.
* The trash must be refactored so that pages don't lose their context in the tree while they are considered trash in some locales. Trash is just one more toggle-able flag that might get propagated as part of the commit process.
* Make sure any contextual save operations have a chance to complete before the preview iframe is requested.

## Diff preview case notes

Documentation of how the diff deltas work:

https://github.com/benjamine/jsondiffpatch/blob/master/docs/deltas.md

Cases:

1. NEW AREA: If the area itself is an array property, that means the entire area is being set, i.e. it's new. Just
mark it all as new.

2. NEW WIDGET: If a widget in the items array (which is represented as an object with string keys) is itself an array property with just one element, that means the widget is new. Mark that one widget as new. It has an _id and you're looking at the draft, so find it that way, don't worry about the index.

3. UPDATED WIDGET: if a widget in the items array is an object property, that means the widget has been updated. "items" will have "_t: a". The index of the widget will be a plain number, relative to the draft, so you can use that index to flag the correct widget as updated.

4. MOVED WIDGET: items._1 (note the _) indicates that the item that used to be [1] moved. items._1 is an array, however we can just look at items_1[0]._id to quickly identify the widget to be highlighted.

5. DELETED WIDGET: items._t is present and set to "a", "_n" exists where n is the old index, and the value is an array: [ oldvalue, 0, 0 ]. Feed oldvalue to the widget renderer, display it at the appropriate index, and highlight it as deleted.

