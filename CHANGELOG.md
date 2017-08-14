# Changelog

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

