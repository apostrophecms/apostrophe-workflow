# Changelog

## 2.21.1

Unit tests passing.

* Improved compatibility with the global apostrophe `prefix` option, which is now included in locale-switcher links.

## 2.21.0

Unit tests passing.

Regression tests passing.

* Fixed bugs in the "force export" logic for individual widgets, introduced in 2.20.0.
* `apostrophe-workflow:dereplicate` task. This task makes sense to run only once, when transitioning to the new `replicateAcrossLocales: false` option.
* If `apostrophe-express.csrf.disableAnonSession` is set, do not store the current locale in the session. Note that this means all locales must be distinguished by hostname, prefix or a combination of the two. If this is not yet the case in your configuration, you should fix that in any case, because for SEO purposes the same URL should never yield two different pages. 

## 2.20.0

Unit tests passing.

Regression tests passing.

Added the `replicateAcrossLocales: false` option. When this option is explicitly set `false`, the workflow module does not immediately replicate all documents across all locales. The user can still make a document available in a new locale in the following ways: Export (after commit), Force Export, Force Export of a Single Widget (if the doc is not in the locale at all yet, the entire doc exports), Switch Locale (via the locale switching UI for logged-in editors).

The only difference website editors are likely to notice is that a document that doesn't exist in the locale yet cannot be found by looking under "Trash" in the locale. Instead it must be exported from a locale where it does exist.

Although it is not the default for backwards compatibility, this new approach is preferred because:

* It removes any database size penalty or performance penalty for scenarios where there are many locales, and a large percentage of documents are only of interest in one locale, or a few locales.
* It removes clutter from the "trash" view of the locales where a significant percentage of docs on the site are irrelevant.

When adopting this new option for an existing site, currently there is no official migration strategy for removing existing docs that are considered "irrelevant" in certain locales. It is not always possible to distinguish a document in the trash due to never having been relevant to the locale from a document that was intentionally placed there. If you wish you may remove them from the mongodb database according to your own preference and practices.

## 2.19.0

Unit tests passing.

Regression tests passing.

* The "Modified Documents" dialog box has been rebranded as the "Manage Workflow" dialog box, and now includes a "Modified" filter. Initially you see *all* documents subject to workflow; you can pick "Yes" from the "Modified" dropdown to see only those that need to be committed.
* The "Manage Workflow" dialog box now has a "Last Commit" column, which is sortable (click the column heading). This is very handy to find recently committed documents.
* The "Last Edited" column can also be sorted.
* Requires apostrophe 2.86.0.

Thanks to Michelin for making these features possible through [Apostrophe Enterprise Support](https://apostrophecms.org/support/enterprise-support).

## 2.18.0

Unit tests passing.

Regression tests passing.

* Added a sortable "Last Commit" column to the "Manage Pieces" view. Click once to display the most recently committed pieces first. This is helpful when many users are committing and you don't have time for a "submit" process but still want to keep tabs on what is happening.

Many thanks to Michelin for making this feature possible via [Apostrophe Enterprise Support](https://apostrophecms.org/support/enterprise-support).

## 2.17.0

Unit tests passing.

Regression tests passing.

* Added the `disableExportAfterCommit` option, for compatibility with how boolean editable
fields work in the `apostrophe-override-options` module.
* Unit test coverage to verify that the new support for adding default values from the schema
for new fields of the global doc does not break in the presence of workflow.

## 2.16.2

Unit tests passing.

Regression tests passing.

* Setting `submittedModal` to `false` now works as expected. Thanks to Fredrik Ekelund for the fix.
* As the documentation has always stated, if a command line task is invoked without the `--workflow-locale` option, the default locale is assumed. Beginning with this release, `req.locale` is always populated accordingly, eliminating the risk that code will not explicitly check for a missing `req.locale` setting when workflow is known to be present.

## 2.16.1

Unit tests passing.

Regression tests passing.

* Bug fix: don't crash if a document is updated during application startup, after `apostrophe-docs` is initialized but before `apostrophe-workflow`. Note that for best results with workflow it is not recommended to write documents to the database prior to the `apostrophe:modulesReady` event unless the document types are exempt from workflow.

## 2.16.0

Unit tests passing.

Regression tests passing.

### Feature addition: the "Modified Documents" dialog box, and related changes

> Many thanks to Michelin for making these improvements possible via [Apostrophe Enterprise Support](https://apostrophecms.org/support/enterprise-support).

* Added a "Modified Documents" dialog box. This new dialog box provides an interface similar to "Manage Pieces," allowing you to browse all of the documents that are considered modified and could potentially be committed. In particular, clicking the "select everything" box and then selecting a batch operation like "commit" or "revert" is very useful here. You can also filter by document type, filter by whether documents were submitted for review, etc.

By default this dialog box is not enabled, but we recommend that you enable it by configuring the `apostrophe-workflow-modified-documents` module in app.js. You do not need to pass any options, just turn it on, like this:

```javascript
// in app.js

require('apostrophe')({
  'modules': {
    'apostrophe-workflow': { ... various config here },
    'apostrophe-workflow-modified-documents': {}
  }
});
```

You do not need to separately install it, you just need to turn it on in `app.js`.

If you have grouped your admin bar, you'll want to add it to your "Workflow" group as `apostrophe-workflow-modified-documents`.

With this module in place, the "Submitted" dialog box is a bit redundant. If you wish, you can disable it by setting the `submittedModal` option of `apostrophe-workflow` to `false`.

* This release includes a database migration. If that migration is not run, you will not see the "Commit" button on any pages until it is run.

> You should *always* run the `apostrophe-migrations:migrate` command line task after upgrading apostrophe modules in your dev environment. In production, running that task should always be part of your deployment process, and if you are using our Stagecoach deployment scripts then it already is.

You can run the migration task like this:
```
node app apostrophe-migrations:migrate
```

You only need to run this task right after upgrades and as part of deployments. You can also [write your own migrations](https://apostrophecms.org/docs/modules/apostrophe-migrations/index.html#add).

* Major performance improvements to workflow. These optimizations, and the modified documents dialog box feature, are the reasons why the migration is needed.

* The `exportAfterCommit` option, which can be set to `false` to disable the "Export" modal that otherwise appears after each commit, can now be set via [apostrophe-override-options](https://github.com/apostrophecms/apostrophe-override-options).

* The mechanism that adds missing locales for documents as needed now has a final failsafe that will operate correctly if all other heuristics fail to spot a missing document.

* The mechanism that determines whether the "Commit" button should appear produces far fewer false positives.

### Additional updates

* 404 handling for the "switch locale" mechanism has been improved. Rather than a custom log message the user is now redirected to a reasonable guess (based on the slug) in the desired locale, typically leading to a normal 404 page that is more helpful to the user. Thanks to Fredrik Ekelund.

## 2.15.2

Unit tests passing.

Regression tests passing.

* Suppress loader recursion warnings for `getEditable`, which is not part of normal page rendering.
These warnings made the console of the server very noisy
and are not significant in this particular case. When encountered in ordinary page rendering they are
quite significant because they typically mean joins have not been locked down with projections and
excessive queries are being made due to recursion.

## 2.15.1

Unit tests passing.

Regression tests passing.

Certain frequently accessed, long-running API routes of this module were causing session storage race conditions, with observed consequences such as draft content being received when live content should have been, et cetera. This was fixed by marking those routes as read-only with respect to the session via the `apos.utils.readOnlySession(req)` API. Note that `apostrophe` 2.75.0 (or better) must be used with this version of `apostrophe-workflow`.

## 2.15.0

Unit tests passing.

Regression tests passing.

* "Reorganize" (aka "Manage Pages") and Workflow finally play together well!

In the past, it worked like this: any movement of a page in the tree automatically took place across all locales where that page was not considered trash. Including draft and live locales.

This was widely considered a bug. It was actually a choice made due to challenges implementing true workflow for "reorganize," but it certainly felt like a bug.

Certain permissions restrictions added frustration and did not reduce the risk associated with the feature as much as hoped.

Now, beginning with version 2.15.0, it works like this:

* To move a page via "reorganize," you simply need permission to edit that page and the page you are dropping it on, just like normal Apostrophe.
* Until you commit this has *no effect* on the live version of the page.
* When you commit, the same move operation is applied to the live version of the page.
* When you export, or force export, that move operation is applied to the draft versions of the appropriate locales.

In short... it works like most users always assumed it did!

We hope you find this to be a substantial improvement in usability and safety for this feature.

## 2.14.0

Unit tests passing.

Regression tests passing.

* defaultLocalesByHostname option for situations where the hostname still has several prefixes but one is a sensible default other than the global default.

## 2.13.3

Unit tests passing.

Regression tests passing.

* Do not crash when legacy locales no longer in the configuration are present for some but not all documents when moving a page in the tree.
* The applyToSubpages dropdown on the page settings permissions tab is a one-time action that happens on save, it's not a setting. So toggling it to see what that setting is currently in "live" does not make sense.

## 2.13.2

Unit tests passing.

Regression tests passing.

* Fixed [bug affecting cross-domain logins](https://github.com/apostrophecms/apostrophe-workflow/pull/215#pullrequestreview-180432022) which made it difficult to log in again on the original domain. Thanks to Manoj Krishnan.

## 2.13.1

Unit tests passing.

Regression tests passing.

* Removed time-consuming migration that belongs in apostrophe core that previously ran each time locale changes were detected.
* Better feedback when adding missing locales at startup.
* Add trailing slash to URL when redirecting visitors to locale homepage, saving a redirect.

## 2.13.0

Unit tests passing.

Regression tests passing.

* When committing via the main "Commit" button, you are now also invited to commit any uncommitted trashed docs. Thanks to Fredrik Ekelund.
* You have always been able to have more than one locale with the same hostname, as long as each one had a prefix. You may now have one (1) locale *without* a prefix on a hostname that also features other locales. However, there is a catch: you must help Apostrophe distinguish page URLs that should switch the locale from API URLs that should not. If you don't want to do that, just continue to prefix all of your locales that share a hostname. See the documentation of the new `addApiCalls` option. Thanks to Manoj Krishnan.
* At commit time, if a property that exists in the schema has been completely deleted, it is now deleted from the live doc too.
* The history modal is now available even in the absence of localization for pieces. It was already available in this scenario for pages.

## 2.12.1

Unit tests passing.

Regression tests passing.

* The commit history modal dialog box is now available when using the workflow module without internationalization/localization features. This makes sense because the history modal permits you to roll the draft version of the document back to an earlier commit, in addition to offering export features that are intended for localization.

## 2.12.0

Unit tests passing.

Regression tests passing.

* Workflow-related batch operations for pages. These work just like the batch operations for pieces. You can find them in the "Reorganize" view (also reachable via "Pages" on the admin bar). 
* Option to disable "export after commit." For some users, this is only an occasionally useful feature, and it doesn't make sense to present it 100% of the time. To shut that behavior off, set the `exportAfterCommit` option to `false`. To facilitate the discovery of alternatives, the "History" workflow menu item is now labeled "History and Export." Note that you can export any commit, not just the most recent one, which is useful if you skipped several.

## 2.11.2

Packaging only.

## 2.11.1

Documentation only.

## 2.11.0

Unit tests passing.

Regression tests passing.

* Eliminated `$or` MongoDB queries for performance. Performance tests show `$ne: true` is as good or better.
* Run quiet.
* Documentation improvements: table of contents. Big thanks to Fredrik Ekelund.
* Clarified that running the `add-missing-locales` task is currently mandatory for migrating existing sites. This may become automatic soon.
* Always use the manager of a doc type to update it with a new commit, if possible. This means that `beforeSave`, `beforeUpdate`, `afterSave` and `afterUpdate` methods of a pieces module will be called in this situation.

## 2.10.3

Unit tests passing.

Regression tests passing.

* Locale stylesheets now have long cache lifetimes in the browser. In addition, the default locale stylesheet now has a cachebusting generation identifier in its URL, ensuring this is safe. (Locale-specific stylesheets already did.)
* UX bug fix: if permissions for specific locales are granted for a particular permission, you should be able to see these immediately if you reopen the settings for that group later. Prior to this fix you had to toggle the permission off and on again to open the tree of locales.
* All direct calls to MongoDB's `docs.db.find()` are now `docs.db.findWithProjection`, which is patched by Apostrophe to always work the way the MongoDB 2.x driver `find()` method did, even if the 3.x driver is in use via the forthcoming `apostrophe-db-mongo-3-driver` module.

## 2.10.2

Unit tests passing.

Regression tests passing.

* Use apos.locks.withLock to avoid race conditions when manipulating the configuration. Also: use, and pass, the apostrophe lint standards rather than the punkave standards, which mostly meant using `apos.utils.error` and friends, but also revealed a missing dependency on `qs`.

## 2.10.1

Unit tests passing.

Regression tests passing.

* `apostrophe-workflow` again operates properly with no `prefixes` option. This was an oversight in the logic introduced in `2.10.0` to optimize the `add-locale-prefixes` task and make it automatic at startup. Test coverage has been added to make sure this scenario is always checked for in the future.
* The "live/draft" toggle in schema-driven forms now works properly with field types that have more than one `label` element, provided they themselves use `self.findFieldset` in the usual way to scope everything else.

## 2.10.0

Unit tests passing.

Regression tests passing.

* Developers no longer have to explicitly run the `apostrophe-workflow:add-missing-locales` and `apostrophe-workflow:add-locale-prefixes` command line tasks. Much like parked pages, these are implemented automatically when starting up your node server process or when running command line tasks such as `apostrophe-migrations:migrate`. It is still possible to run these tasks explicitly.
* `apostrophe-workflow:add-locale-prefixes` can now remove a slug prefix that is no longer present in your configuration, provided that it was present on a previous startup with this version or newer. All historical locale slug prefixes are remembered for consideration in the cleanup process.
* `apostrophe-workflow:add-locale-prefixes` has been optimized to avoid unnecessary work.

## 2.9.4

Unit tests passing.

Regression tests passing.

* When the commit option is chosen but there is no actual change to commit, don't get hung up in the progress display. This was an issue only when accessed via a workflow dropdown menu.

## 2.9.3

Unit tests passing.

Relevant regression tests passing.

* Exempt the locale specific stylesheet generation routes from loading `apostrophe-global`, for performance. Significant performance boost when `apostrophe-global` contains joins.

## 2.9.2

Unit tests passing.

Regression tests passing.

* Updated package dependencies; passing `npm audit`.

## 2.9.1

Unit tests passing.

Relevant regression tests passing.

* You can once again add `apostrophe-workflow` to an existing project that already has a database before the point at which `apostrophe-workflow` is enabled. You do still need to follow the documentation's instructions to run the `apostrophe-workflow:add-missing-locales --live` task before first use after adding workflow. Thanks to Carsten for reporting the bug.

## 2.9.0

Unit tests passing.

Regression tests passing.

* New `Revert Draft` button available in the `History` modal, allowing users to roll the draft back to the content of any past commit. "Page Versions" is available too, but this is often more intuitive.

## 2.8.2

Unit tests passing.

Regression tests passing.

* Unit test fix to accommodate a performance improvement in Apostrophe's queries. No code changes to this module.

## 2.8.1

Unit tests passing.

Regression tests passing.

* Index on `path, level, workflowLocale` for performance.

* Dropdown menu name attributes for nightwatch functional test compatibility.

## 2.8.0

Unit tests passing.

Regression tests passing.

This release is focused on demystifying the process of activating docs in additional locales:

* Activating pages and pieces in new locales is much more intuitive. The `apostrophe-workflow:add-missing-locales` task will base the content of a new doc on its closest available ancestor in the locale tree. For drafts, the "trash" status of a doc in a new locale will match that of its closest available ancestor.
* The locale picker modal now clearly indicates which locales are still in the trash. If you click on one of these, you are invited to force export it or just rescue it from the trash, according to whether it has ever been modified or not in the new locale (i.e. whether it was deliberately placed in the trash there).
* Locale prefixes are not erroneously duplicated when the slug is exported.

## 2.7.4

Unit tests passing.

Regression tests passing.

* Prevent various duplicate prompts about related docs to commit or export
* Deoptimize overly complicated calculations of which related docs need exporting to eliminate bugs
* Body classes for draft and live mode. Thanks to Raphaël DiRago
* Eliminated race condition that led to null IDs in some exports of joins

## 2.7.3

Unit tests passing.

Regression tests passing.

* Accommodations for the forthcoming `apostrophe-optimizer` module.

## 2.7.2

Unit tests passing.

Regression tests passing.

* Fixed race condition introduced in version 2.7.1 which could lead to incorrect remapping of joined document IDs when committing or exporting. 
* Fixed scenario in which a missing doc resulted in a restart. Thanks to Sylvain Chabert.

## 2.7.1

Unit tests passing.

Regression tests passing.

* Insertion of new documents sped up by 2x when many locales exist.
* Export choices made for the first document in a series of commit and export dialogs are now the default for the next, and so on. This saves time and reduces mistakes.
* "Commit all like this" and "skip all like this" buttons added to ease committing and exporting numerous related documents, like images for a slideshow that exists on the page. These are set up to reduce the number of steps required. You can of course ignore them and continue to commit each doc individually. The "in context" doc (the page or piece at this URL) is still prompted for separately.
* Added `apostrophe-workflow:harmonize-workflow-guids-by-parked-id` task. You are unlikely to need this unless you are receiving unique index errors, due to an older database where parked pages did not always have a `parkedId` property and have many locales. However in that situation it is useful to clean up leftover duplication caused by situations that are no longer possible with `parkedId`. Like `apostrophe-workflow:remove-numbered-parked-pages`, this task can remove content in certain cases, so back up your database first.

## 2.7.0

Unit tests passing.

Regression tests passing.

* Basic support for per-locale stylesheets. Useful when you need the same `@font-face` to refer to different files for different locales.

## 2.6.4

Unit tests passing.

Regression tests passing.

* Fixed bug in which localization helper would crash if used in a newly saved widget. The helper does not actually display localizations until page refresh due to a deeper issue but this is only a concern when editing, not for the public. 
* Merged helper implementations into `helpers.js` for consistency.

## 2.6.3

Unit tests passing.

Regression tests passing.

* Fixed bug in which parked properties of existing pages were not updated for draft locales.
* Documented the strong recommendation to set a `parkedId` for parked pages so that you do not encounter problems later when changing or adding locale prefixes.
* Introduced locking so that the page parking mechanism never encounters race conditions.
* If `defaultLocale` is not set, the first locale configured is assumed.
* The `apostrophe-workflow:remove-numbered-parked-pages` task, which continues to be of use when working around previous parking bugs, now accounts for the fact that `parked` may contain previously parked properties rather than being a simple boolean.
* `apostrophe-workflow:add-missing-locales` task sped up approximately 3x using parallelism.

## 2.6.2

Unit tests passing.

Regression tests passing.

* Run beforeInsert, afterInsert, etc. on docs inserted across locales, especially pieces. Previously `apos.docs.insert` was invoked; this does not invoke such module-level callbacks, although it does invoke the `callAll`-based callbacks.
* Added unit tests confirming that `afterInsert` callbacks can successfully update a piece, and that they are invoked both for the original insert and those that cascade to insert it across locales.
* This module now complies with an eslint code quality validation suite. A number of global variable leaks were corrected, as well as improvements in error handling, etc.

## 2.6.1

Unit tests passing.

Regression tests passing.

* Prior to this release, a race condition could lead to duplicate documents with the same combination of `workflowGuid` and `workflowLocale`. A unique sparse index on `workflowGuid + workflowLocale` has been added to address this problem, and if it initially fails, code has been added to address any existing duplicates. A winner is chosen, and the others are moved to a `workflowGuidAndLocaleDuplicates` array property, just in case. Any joins from other documents to those orphaned duplicates are automatically corrected to point to the winning version.

* Documented that when writing an `afterInsert` or similar method override or `callAll` handler, developers using workflow must not invoke the callback provided until **after** carrying out any `update` of the piece or page in question. This means you must wait for your own callback before invoking the one provided by Apostrophe. Otherwise race conditions can lead to an error in your insert operation, which will be reported as such thanks to the new index mentioned above.

* The migration above now completes on very large doc collections thanks to the use of the `allowDiskUse: true` flag. Thanks to Sylvain Chabert.

* 

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

