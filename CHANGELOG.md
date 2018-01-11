# Changelog

## 2.6.0

Unit tests passing.

Regression tests passing.

* Implemented `lang` helper to easily set the lang attribute of the html tag. It is your responsibility to call it if you choose, see the documentation.
* UX improvement: no export modal should be displayed after committing if you can only edit one locale anyway based on permissions.

## 2.5.1

Unit tests passing.

Regression tests passing.

* The new `apos.docs.ensureSlug` method is called in `beforeInsert` to ensure there is no chicken-and-egg problem when working with new documents.

## 2.5.0

Unit tests passing.

Regression tests passing.

* Beginning with this release, the `private-locales` permission is enforced. You **must** give out the "View Private Locales" permission to your editors via groups in the admin bar. If you are still using hardcoded groups via the `groups` option of the `apostrophe-users` module, you must add the `private-locales` permission to relevant groups and restart. However we recommend commenting out the `groups` option if you're using workflow; odds are you have a need to manage groups and their permissions through the UI at this point.

Users with the global `admin` permission do **not** need to be given this permission separately.

## 2.4.1

Unit tests passing.

Regression tests passing.

* Do not fetch areas and joins when simply checking whether an individual related doc has been changed (we already fetched areas and joins on the original page, this is about those related to it). We were not using the information and it made the check for committable related docs very expensive and slow.
* Reject invalid slug prefixes (those not beginning with /) and those not currently implemented (those with more than one /). Without this check an accidentally left out `/` can result in many duplicate parked pages.
* Leverage the new `apostrophe-jobs` module for long-running batch operations on pieces with progress display.

## 2.4.0

Unit tests passing.

Regression tests passing.

* Fixed a bug that generated duplicate pages in certain cases when new locales were encountered in the configuration at startup.
* Batch operations on pieces for workflow: submit, commit (with an optional export step), and force export. Since these are batch operations, they do not display a preview and a confirmation modal for each and every document, so they should be used only when you know a large volume of documents are "ready to go."
* Factored a javascript API up from the routes for easier programmatic use.
* Facilitate local dev testing of hostnames feature by accommodating the port number of the original request when generating cross-locale links.
* Do not park pages when running `add-locale-prefixes`.

## 2.3.3

Unit tests passing.

Regression tests passing.

* Safely ignore widgets with no manager.
* When autoconfiguring the `hostnames` feature based on the legacy `subdomains` setting, keep port numbers unless they are `80` or `443`.
* Override `getBaseUrl` method of `apostrophe-pages` to push out the right absolute URLs based on the hostnames option.

## 2.3.2

Unit tests passing.

Regression tests passing.

* If an area is present in live but absent in draft, remove it during a commit, unless it is excluded from workflow. Presents the commit button from appearing where it shouldn't if an area has been removed from the template.

## 2.3.1

Unit tests passing.

Regression tests passing.

* Even if `--live` is not specified, the `add-missing-locales` task still helps you out by making sure docs don't start out in the trash in draft locales; very confusing otherwise.
* Many instances of the "commit" button appearing needlessly were eliminated by normalizing the difference between the trash property being `false` and the trash property being nonexistent.
* Documentation note regarding tags and localization.

## 2.3.0

Unit tests passing.

Regression tests passing.

* Introduced `setPropertiesAcrossLocales` method, which is convenient for programmatically updating many properties of a doc across some or all locales.

## 2.2.2

Unit tests passing.

Regression tests passing.

* When exporting, moves should be handled from the top down (parent widgets first). Otherwise nested widgets can be lost.
* New unit tests covering this.

## 2.2.1

Unit tests passing.

Regression tests passing.

* When exporting, reordering widgets should export only the change in ordering; it should not erase localizations performed on those widgets in the target locale.

## 2.2.0

Unit tests passing.

Task-relevant regression tests passing.

* `workflow-locale` command line option for tasks. Also new documentation on the subject of workflow and how it interacts with tasks.

## 2.1.5

Unit tests passing.

Task-relevant regression tests passing.

* Do not park pages when running the `apostrophe-workflow:add-missing-locales` task, this prevents duplication and an apparent loss of pages (it is actually a duplicate home page without children that you are seeing).

If you were affected by this, there is a task that can be used as a one-time cleanup:

`node app apostrophe-workflow:remove-numbered-parked-pages`

## 2.1.4

Unit tests passing.

Regression tests passing.

* Performance and accuracy improvements to the mechanism that decides whether to display the "submit" and "commit" buttons, eliminating false positives and reducing the amount of server work required.

* Attempts to force-export a nested widget whose parent does not exist in the receiving locale should fail; however this was not producing a clear error message in certain cases and it was also possible to be left with the modal still on the page. Fixed.

* Added the `apostrophe-workflow:resolve-join-ids` task, which can be used to resolve join ids pointing to the wrong locale. This should never happen, but did happen prior to certain recent fixes re: joins in array fields. It should be a one-time fix but can safely be run more than once.

## 2.1.3

Unit tests passing.

Regression tests passing.

* If an object that is modified in the exported commit does not exist at all in the draft being patched, don't crash; just disregard it.
* Always show live content in live mode.
* Update the submit and commit buttons only at page load and after actual changes to areas. This significantly reduces unnecessary server load due to polling.
* Refactored to ensure the invitation to export after a commit, etc. works for contextual pieces that eventually refresh the page on save.
* Eliminated false positive change detections caused by the `advisoryLock` property.

## 2.1.2

Unit tests passing.

Regression tests passing.

* The commit preview now displays deleted widgets properly when they have child widgets. Prior to this fix any subwidgets were absent from the preview, which was confusing and caused crashes in cases where templates were not tolerant of this situation.

* Beginning in version 2.1.0 a crash was possible after exporting a document if related documents were joined without `type` in the projection. This has been fixed.

## 2.1.1

Unit tests passing.

Regression tests passing.

* When exporting a widget, all properties are now exported via the smallest "diff" possible, avoiding unnecessary overwrites of other properties that were not changed in the commit. Previously this was only true for subwidgets.
* Joins nested in array schemas now participate properly in the `add-missing-locales` task and related mechanisms.
* After a doc is exported, an invitation is offered to export any related docs (such as the images in a slideshow) that have never been exported to the locales in question and are not yet live in those locales.
* If the "force export" button for an individual widget is used, and the widget is nested deeply in a context that doesn't exist in the destination locale (such as a nested area), an informational error is reported and no crash occurs.

## 2.1.0

Unit tests passing.

Regression tests passing.

* You can now configure your own mapping of locales to URL prefixes and hostnames. You may use any combination of the two, as long as it is always possible to determine exactly which locale is intended. For instance, if a hostname is not shared by two locales, then that locale does not need a URL prefix, while another hostname might have three locales and thus require prefixes for all three. The `subdomains` and `prefixes` options are still supported for simpler cases.
* Single sign-on is provided for sites using multiple hostnames for different locales. As long as you use the provided locale switcher button to change locales, your login session will be carried through to the other locale.
* A bug was fixed which could cause the generation of superfluous copies of parked pages at startup in certain circumstances involving prefixes. These can be removed via the command line task `node app apostrophe-workflow:remove-numbered-parked-pages`. This is a one-time correction.

## 2.0.7

All tests passing.

* Subwidgets were being lost in the export process in the event that the parent widget also had some property changes of its own. This has been fixed. If the parent widget has changed properties that are *not* subwidgets, the entire parent widget is exported, including all subwidgets. Fine-grained patching is of course still done if the only modifications are to subwidgets. At some point in the future fine-grained patching of schema fields within widgets may also be performed, however this requires further consideration.

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

