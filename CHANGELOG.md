# Changelog

## 2.0.6

All tests passing.

* The locale picker modal now generates intermediate links that will complete the locale switch without being confused by issues such as the "best page" mechanism of `apostrophe-pieces-pages` considering the wrong locale. Although this could have been addressed by iterating over all of the locales and performing requests with each locale, it would have been very slow, and the `getLocalizations` method involved also supports the front end of sites, where excessive overhead is to be avoided. Therefore it makes more sense to do the full work to build the final URL for the document being linked to only once, for the locale the user actually clicks on.

## 2.0.5

All tests passing.

* The locale picker modal now can link to valid URLs for pieces. Previously an insufficiently generous mongo projection left out the `type`.

## 2.0.4

All tests passing.

* Previously the locale picker code assumed that localizations of a given document always had a `_url` property which led to crashes in the `build` filter. Now, if there is no `_url` property available, no link is available for that locale in the locale picker.

## 2.0.3

All tests passing.

* Fixed a bug that caused joined documents, such as images, not to be displayed in previews of old commits. This bug has been addressed, however previews of commits that predate the fix will still not show joined content.

Note that since any joined document can unexpectedly be missing, for instance because the joined document has been moved to the trash, your templates must always test for or otherwise tolerate this situation in any case. Not doing so could result in a template error on the actual page, not just on a preview of the older commit.

## 2.0.2

All tests passing.

* Use new accommodations for unit tests of related modules in Apostrophe.
* Better feedback about the submitted state of the page.
* Use global busy mechanism to avoid race conditions.

## 2.0.1

All tests passing.

* A bug was fixed that caused joins in widgets in draft documents to point to ids in the live locale after the user clicks "commit," in effect clearing the selection for that join. This will not occur in future commits.

## 2.0.0

Initial release.

