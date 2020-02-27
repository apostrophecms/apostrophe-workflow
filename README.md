## Overview

The `apostrophe-workflow` module adds powerful workflow and localization capabilities to Apostrophe. As a workflow system it provides for a draft version of every document, so that changes do not immediately "go live." As a localization system it provides for documents to exist in several locales, allowing for easy internationalization.

We'll begin with the steps needed simply to add workflow to your project. Then we'll examine the changes needed for localization (also known as i18n or internationalization).

- [Before getting started](#user-content-before-getting-started)
  * [Turning off automatic replication across locales](#turning-off-automatic-replication-across-locales)
  * [Adding `parkedId` to your parked pages](#user-content-adding-parkedid-to-your-parked-pages)
  * [Adding workflow to your database](#user-content-adding-workflow-to-your-database)
- [Using the workflow feature](#user-content-using-the-workflow-feature)
  * ["Why am I asked to commit so many things?"](#user-content-why-am-i-asked-to-commit-so-many-things)
  * [Workflow for pieces](#user-content-workflow-for-pieces)
  * [Workflow for page settings](#user-content-workflow-for-page-settings)
- [Using the localization feature](#user-content-using-the-localization-feature)
  * [Private locales and default locale](#user-content-private-locales-and-default-locale)
  * [Document structure for locales](#user-content-document-structure-for-locales)
  * [Setting the `lang` attribute](#user-content-setting-the-lang-attribute)
  * [Tags and localization: we recommend using joins instead](#user-content-tags-and-localization-we-recommend-using-joins-instead)
  * [Building a locale picker on the front end](#user-content-building-a-locale-picker-on-the-front-end)
  * [Exporting between locales](#user-content-exporting-between-locales)
    + [Not all patches can be exported](#user-content-not-all-patches-can-be-exported)
  * [Forcing exports](#user-content-forcing-exports)
  * [Forcing export of one widget](#user-content-forcing-export-of-one-widget)
  * [Switching locales via custom hostnames and/or prefixes](#user-content-switching-locales-via-custom-hostnames-and-or-prefixes)
    + [Default locales by hostname](#default-locales-by-hostname)
    + [Using `addApiCalls`: when a locale that shares a hostname has no prefix](#using-addapicalls-when-a-locale-that-shares-a-hostname-has-no-prefix)
    + [Adding prefixes to an existing database](#user-content-adding-prefixes-to-an-existing-database)
    + [If you only care about subdomains](#user-content-if-you-only-care-about-subdomains)
    + [If you only care about prefixes](#user-content-if-you-only-care-about-prefixes)
    + [One login across all hostnames](#user-content-one-login-across-all-hostnames)
    + [Locale-specific stylesheets](#user-content-locale-specific-stylesheets)
  * [Excluding certain types and properties from workflow](#user-content-excluding-certain-types-and-properties-from-workflow)
- [Workflow with permissions: limiting who can do what](#user-content-workflow-with-permissions-limiting-who-can-do-what)
  * [Setting up for permissions: enabling group management](#user-content-setting-up-for-permissions-enabling-group-management)
    + [Removing the legacy groups](#user-content-removing-the-legacy-groups)
  * [An overview of permissions](#user-content-an-overview-of-permissions)
    + [The "Editor" permission](#user-content-the-editor-permission)
    + [The "Admin: All" permission](#user-content-the-admin-all-permission)
    + ["View Private Locales"](#user-content-view-private-locales)
    + ["Upload and Crop"](#user-content-upload-and-crop)
    + [The "Admin: Global" permission](#user-content-the-admin-global-permission)
    + [The "Edit: Global" permission (do not use)](#user-content-the-edit-global-permission-do-not-use)
    + ["Admin: Pages": total control of pages](#user-content-admin-pages-total-control-of-pages)
    + ["Edit: Pages": candidates to edit pages](#user-content-edit-pages-candidates-to-edit-pages)
    + ["Admin: Article": total control of articles](#user-content-admin-article-total-control-of-articles)
    + ["Edit: Article": creating and editing their own articles](#user-content-edit-article-creating-and-editing-their-own-articles)
    + ["Admin: Image": total control of articles](#user-content-admin-image-total-control-of-articles)
    + ["Edit: Image": creating and editing their own images](#user-content-edit-image-creating-and-editing-their-own-images)
    + ["Edit: File": creating and editing their own files](#user-content-edit-file-creating-and-editing-their-own-files)
  * [Locales for permissions](#user-content-locales-for-permissions)
  * [Permissions tutorial](#user-content-permissions-tutorial)
    + [Creating the fr-editors group](#user-content-creating-the-fr-editors-group)
    + [Creating an "fr-editor" user](#user-content-creating-an-fr-editor-user)
    + [Creating the "fr-committers" group](#user-content-creating-the-fr-committers-group)
    + [Creating an "fr-comitter" user](#user-content-creating-an-fr-comitter-user)
    + [Granting editing permissions on the home page](#user-content-granting-editing-permissions-on-the-home-page)
    + [Working with the "fr-editors" account](#user-content-working-with-the-fr-editors-account)
    + [Working with the "fr-committers" account](#user-content-working-with-the-fr-committers-account)
    + [Exporting](#user-content-exporting)
    + [Accessing newly created pages in other locales](#user-content-accessing-newly-created-pages-in-other-locales)
- [Removing workflow from a project](#removing-workflow-from-a-project)
- [Other developer concerns](#user-content-other-developer-concerns)
  * [Aliasing the module](#user-content-aliasing-the-module)
  * [Previewing piece types without an index page](#user-content-previewing-piece-types-without-an-index-page)
  * [Command line tasks and workflow](#user-content-command-line-tasks-and-workflow)
    + [Using the `-workflow-locale` option](#user-content-using-the-workflow-locale-option)
  * [Setting the current locale programmatically](#user-content-setting-the-current-locale-programmatically)
  * [Direct MongoDB access and workflow](#user-content-direct-mongodb-access-and-workflow)
  * [`setPropertiesAcrossLocales`: modifying a document programmatically across locales](#user-content-setpropertiesacrosslocales-modifying-a-document-programmatically-across-locales)
  * [Writing safe `afterInsert` and `docAfterInsert` handlers, etc.](#user-content-writing-safe-afterinsert-and-docafterinsert-handlers-etc)
    + [Recognizing inserts due to localization](#user-content-recognizing-inserts-due-to-localization)
    + [Always finish the job before continuing](#user-content-always-finish-the-job-before-continuing)
  * [Avoiding Express sessions for anonymous site visitors](#avoiding-express-sessions-for-anonymous-site-visitors)
- [Technical approach](#user-content-technical-approach)
  * [Use of jsondiffpatch](#user-content-use-of-jsondiffpatch)
  * [Patching and exporting of widgets](#user-content-patching-and-exporting-of-widgets)
- [Legacy tasks](#user-content-legacy-tasks)
  * [Cleaning up duplicate homepages](#user-content-cleaning-up-duplicate-homepages)
- [Additional options](#additional-options)

## Before getting started

Start by installing apostrophe-workflow.

```
npm install --save apostrophe-workflow
```

Then configure the `apostrophe-workflow` module in `app.js` with the rest of your modules. We'll start with a simple configuration just providing workflow. We will also turn on the very handy "Manage Workflow" dialog box by turning on the `apostrophe-workflow-modified-documents` module, which comes bundled inside `apostrophe-workflow`. You do not have to separately install it.

```
'apostrophe-workflow': {
  // IMPORTANT: if you follow the examples below,
  // be sure to set this so the templates work
  alias: 'workflow',
  // Recommended to save database space. You can still
  // export explicitly between locales
  replicateAcrossLocales: false
},
'apostrophe-workflow-modified-documents': {}
```

### Turning off automatic replication across locales

For historical reasons, in the default configuration, documents automatically replicate between
locales (languages), starting out in the trash in other locales until they are made active there.

Our own clients have found this wastes a lot of database space. So, set `replicateAcrossLocales: false`
as shown above. Users can still export documents between locales as you'll see later on.

> Did you already start a large project with replicated documents? You can use the `apostrophe-workflow:dereplicate` command line task to remove documents from all other locales if they are outside the trash in only one locale. We recommend backing up your database first.

### Adding `parkedId` to your parked pages

If you are using the `park` option with `apostrophe-pages`, and you have not already set a unique `parkedId` property for each page specified for that option, **do so before you start using workflow.** This will address problems that otherwise occur if slugs change due to locale prefixes.

### Adding workflow to your database

Odds are, you already have a database. Either from an existing project, or for a new one, since Apostrophe creates the database on the very first run. So, follow these steps to add workflow to your database.

1. **For existing projects, we recommend backing up your database first,** to make it easier to change your mind. However, there is an `apostrophe-workflow:remove` task available if you choose to remove workflow later.

You should initially experiment with this module with a *local* copy of your site, not your live production content.

You can back up your database easily with the `mongodump` command line utility.

**Once you add this module and restart your apostrophe process,** all of your documents will exist in both draft and live versions. Editors will be able to the draft version while in "draft" mode. Everyone else, and editors in "live" mode, will see the live version and will not be able to edit it directly. The only way to make new content live is to "commit" the changes that have been made to the document.

If you have not added an admin user yet, you can do it now in the usual way:

```
# If you do not have preconfigured groups, add a group too
node app apostrophe-groups:add admin admin
# Now add the user
node app apostrophe-users:add admin admin
```

2. **FOR EXISTING PROJECTS, YOU MUST ADD LOCALES TO EXISTING DOCUMENTS.** This is NOT automatic for existing projects, you must run this task on a one-time basis:

```
node app apostrophe-workflow:add-missing-locales --live
```

## Using the workflow feature

This basic configuration provides you with a live/draft toggle on the page (lower left corner). Editing is not possible in the live mode. You will not see most types of pieces in the admin bar, and you will not see editing controls on the page. This is normal.

In the draft mode, editing works in a familiar way. Your changes are constantly saved, just like before, but they are only saved to the draft version of the document.

When you are satisfied, click "submit" to submit your work for review by someone else, or "commit" to commit it to the live version of the page yourself.

If work is submitted that you have permission to edit, you can view a list of those pages and pieces via the "Workflow" admin bar menu.

### "Why am I asked to commit so many things?"

When you click "Commit" on the page, all of the documents that make up what you see on the page need to be committed in order to go live on the site. That includes the images in a slideshow, the blog posts in a blog widget, and so on. It may seem like a lot of work the first time. Just remember that you won't be asked to commit them again unless their drafts have been updated.

> You can commit documents in bulk, too. The easiest way is via the "Manage Workflow" dialog box, accessed via the "Manage" option on the "Workflow" dropdown menu. If you don't see it, switch to draft mode first. If you still don't see it, make sure you enabled the `apostrophe-workflow-modified-documents` module as noted above in the installation instructions. Once you have access to this dialog box, you can use the "Select All" checkbox and the "Batch Commit" operation to expedite things.

### Workflow for pieces

"Pieces," like blog posts or events, work just like before. However, just make sure you enter "draft" mode; until you do that most piece types won't show up on the admin bar, because you can only edit the draft version directly.

When you are finished editing a piece, use the "workflow" menu in the upper right corner of the dialog box to select "submit" or "commit."

### Workflow for page settings

Workflow also applies to page settings, such as the title. You can easily toggle between displaying the draft and live versions of the title while in the page settings dialog box. And, you can submit or commit via the workflow dropdown menu in the upper right corner of the dialog box.

## Using the localization feature

To enable localization, configure more than one locale in `app.js`:

```
'apostrophe-workflow': {
  locales: [
    {
      name: 'default',
      label: 'Default',
      private: true,
      children: [
        {
          name: 'en-gb',
          label: 'England'
        },
        {
          name: 'en-us',
          label: 'United States'
        },
        {
          name: 'fr',
          label: 'France'
        }
      ]
    },
  ],
  defaultLocale: 'en-gb',
  // IMPORTANT: if you follow the examples below,
  // be sure to set this
  alias: 'workflow'
}
```

If you have worked with localization before you will recognize locale names like `en-gb`. These are arbitrary; you may choose any name. However, if you plan to use URL prefixes to distinguish between locales (see below), you must choose a hyphenated, lower-case name without punctuation. So we suggest that you always do that.

### Private locales and default locale

What about the `default` locale? What does `private` do? Private locales cannot actually be accessed by the public. Although it isn't mandatory, we recommend setting up a private `default` locale for the "master copy" of your content, written in your team's most familiar language, and then exporting content to child locales.

**If you use private locales, you *must* give the "view private locales" permission to any Apostrophe groups that should be able to see those locales when logged in.** This is a simple permission that can be granted to a group via the "Groups" option on the admin bar or, if you are using hardcoded groups, via the "groups" option to the `apostrophe-users` module (the latter requires a restart to push the new permission). If you're using workflow, it's probably a good idea to comment out the `groups` option, which allows you to manage your groups through Apostrophe's interface instead.

Note that if you do not have a locale named `default`, you must set the `defaultLocale` option to the name of a locale you do have. If the `default` locale is private, a public locale should be set as `defaultLocale` instead (e.g., `'en-gb'` above). Also note that if you started out with no locales for simple workflow, Apostrophe already created a `default` locale implicitly. Leaving that out of your locale configuration would give you no way to access the existing content.

The parent-child relationship between locales is just a convenience for quickly exporting content to them, as you'll see below. You can nest `children` as many levels deep as you wish.

### Document structure for locales

**When you restart your Apostrophe node process or run a command line task such as `apostrophe-migrations:migrate**, Apostrophe will **automatically** add the new locales to all of the existing docs in the database.

You may also do this explicitly:

```
node app apostrophe-workflow:add-missing-locales
```

By default, docs copied to new locales via this task will be considered trash in all live locales, until an editor chooses to commit them.  If you prefer that that they be immediately live everywhere, use this command instead:

```
node app apostrophe-workflow:add-missing-locales --live
```

Now access the site as an administrator. You will be able to click on the current locale name to switch to other locales.

> Every document automatically exists in all locales, however it may or may not be published or in the trash in any given locale. This is useful since it allows you to have pages that are "only for France," for instance.

Note that a single document may have a different slug in different locales. The slugs may also be the same, but you'll typically want to enable locale-specific prefixes, locale-specific domain names or a combination of the two as described below.

### Setting the `lang` attribute

Multilingual websites should set the `lang` attribute of the `html` element appropriately.

Apostrophe currently ships with an `outerLayoutBase` template that includes a `locale` block,
which can be used to easily override the `lang` attribute of the page. And this module ships with a
helper function to set `lang` for you.

So just write this in your
`lib/modules/apostrophe-templates/views/layout.html` template, or `outerLayout.html` if you have one:

{% block locale %}{{ apos.modules['apostrophe-workflow'].lang() }}{% endblock %}

By default, this helper converts a string like `en-gb` to `en`, and leaves a string like `fr` alone.

If this is not sufficient for your needs, you may set the `lang` property when configuring each
locale, and that value will be output directly.

### Tags and localization: we recommend using joins instead

Tags in Apostrophe follow the typical MongoDB approach of a simple array property containing strings. They are localized like other fields. Thus if they are used to select content for display it is important to be consistent when translating tags to a particular locale.

When working with localization it may be preferable to avoid tags in favor of joins. A `joinByOne` or `joinByArray` relationship can be used to relate a document to various "categories," which are localized documents in their own right and therefore behave consistently across locales. `apostrophe-workflow` will ensure that exported joins referencing a category in one locale are correctly adjusted to point to the equivalent category in the other locale.

### Building a locale picker on the front end

Here's how to code a locale picker on the front end:

```markup
{# Typically in `layout.html` #}
<ul>
  {% for localization in apos.workflow.localizations() %}
    <li><a href="{{ localization._url | build({ workflowLocale: localization.workflowLocale }) }}">{{ localization.label }}</a></li>
  {% endfor %}
</ul>
```

This `ul` will populate with localized links to the current context page or piece. If the page or piece is unpublished or considered trash in a locale, there won't be a link for that locale.

If you use `localization.label` as shown here, you'll see the labels that you set when configuring your locales.

If you use `localization.title` instead, you'll see the title of the individual piece or page as it was translated or localized for that locale. The former is usually less confusing.

This code:

`| build({ workflowLocale: localization.workflowLocale })`

May be omitted if you are using the `subdomains` feature or the `prefixes` feature. If you are using neither, then a query parameter is necessary as the slugs could be the same across locales. However the query parameter is automatically removed after the new locale is stored in the user's session.

### Exporting between locales

After committing a change, you will be invited to export that change to other locales. If you do so, it is applied as a "patch" to the other locale's draft (it is not made live right away).

This allows for editors fluent in the other locale to complete any necessary translation tasks before finally committing the changes for that locale.

#### If you find this option appears too frequently

Do you export rarely? If so, you may want to set the `exportAfterCommit` option of the `apostrophe-workflow` module to `false`, or set `disableExportAfterCommit` to `true`. The latter is useful if you are using the `apostrophe-override-options` module to creaqte an editable boolean field for this purpose.

If you do so, the "export" dialog box will not appear right after every commit. Instead the user must choose to access it. The option can be found on the "workflow" dropdown menu, accessed via "Page Settings" or via the editing dialog box for any piece type, including "global."

#### Not all patches can be exported

If the page has been altered greatly in structure, for example if the rich text widget on a page has been removed and replaced, making it effectively a separate widget altogether, then an edit to that widget will not take effect as a patch. It is a best practice to initially create all content in a "default" locale and then export it to others.

### Forcing exports

If you need to, you can force an export of a document so that it is copied directly to the draft version in other locales. To do that, choose "Force Export" from the dialog box for the piece in question, or from the "Page Settings" dialog box for a page.

> Even a forced export only alters the draft version of the other locales. Work must still be reviewed and committed there.

### Forcing export of one widget

You can also force the export of a single widget. You can do that via the new export button, displayed along with the up and down arrows, edit pencil and trash icon. This will always push that widget to the draft version of the document in other locales, as long as it can be found there.

### Switching locales via custom hostnames and/or prefixes

You'll want URLs to be different between locales so that there is no ambiguity when a user shares them.

You can do so by setting the `hostnames` and/or `prefixes` options. Notice that these are separate from the main `locales` array. This is done to make it easier to differentiate the hostnames between development, staging and production environments using a `data/local.js` file that is present only in the proper environment. Apostrophe merges the contents of that file with your main `app.js` Apostrophe configuration using `_.merge()`, which works best with objects and properties.

Notice that **a hostname is specified for every locale, and if a hostname is shared by two or more locales, all of those locales must specify prefixes.**

*There does not have to be any similarity between the hostnames.* They can be completely different.

**Two or more locales may have the same prefix,** as long as they have different hostnames.

**Two or more locales may share a hostname, as long as no more than one does not have a prefix.** That is, you may have a "fallback" locale for a hostname with no prefix configured, but you can't have more than one.

**If one of several locales sharing a hostname has no prefix, you should review the `addApiCalls` option,** to avoid situations where Apostrophe assumes accesses to a private API implemented by your site should count as a switch to the unprefixed locale.

#### Example

```javascript
    'apostrophe-workflow': {
      hostnames: {
        'fr': 'exemple.fr',
        'default': 'example.com',
        'us': 'example.com',
        'us-en': 'example.com',
        'us-es': 'example.com'
      },
      prefixes: {
        'us': '/us',
        'us-en': '/en',
        'us-es': '/es',
        // We don't need prefixes for fr because
        // that hostname is not shared with other
        // locales
      },
      locales: [
        {
          name: 'default',
          label: 'Default',
          private: true,
          children: [
            {
              name: 'fr'
            },
            {
              name: 'us',
              private: true,
              children: [
                {
                  name: 'us-en'
                },
                {
                  name: 'us-es'
                }
              ]
            }
          ]
        }
      ],
      defaultLocale: 'default',
      // IMPORTANT: if you follow the examples below,
      // be sure to set this
      alias: 'workflow'
    }
```

#### Default locales for individual hostnames

In addition to the global `defaultLocale` option, you can set up a `defaultLocalesByHostname` object to map hostnames to default locales. This is useful if the host has several `prefixes` but a request arrives with no prefix. If the global default locale is not the best choice for `yourcompany.us`, you can map it, for instance, to `en-us`:

```javascript
hostnames: {
  'en-us': 'yourcompany.us',
  'es-us': 'yourcompany.us',
  'default': 'yourcompany.com'
  // ... and other unrelated hostnames ...
},
prefixes: {
  'en-us': '/en',
  'es-us': '/es'
},
defaultLocalesByHostname: {
  'yourcompany.us': 'en-us'
},
defaultLocale: 'default'
```

#### Using `addApiCalls`: when a locale that shares a hostname has no prefix

When one of the locales sharing a hostname has no prefix, Apostrophe needs your help to distinguish between page URLs that should switch to that locale and API calls that should rely on the locale setting already in the user's session.

By default Apostrophe knows that any URL starting with `/modules` should not change the locale. Neither should `/login` or `/logout`, or anything with a file extension, to avoid accidental locale switches due to missing assets.

You can add additional rules like these by passing an array of them as the `addApiCalls` option to the module:

```javascript
  addApiCalls: [
    // simple string match
    '/my/private/api',
    // minimatch glob match, just one folder level
    '/my/apis/*',
    // regular expression
    /^\/nothing\/past\/here\/.*$/
  ]
```

#### Adding prefixes to an existing database

**Prefixes are automatically added to page slugs when Apostrophe is restarted or you run a command line task,** such as `apostrophe-migrations:migrate`.

You can also request this explicitly:

```
node app apostrophe-workflow:add-locale-prefixes
```

This is a one-time action. Prefixes are automatically added to new pages and when editing the "page settings" of old ones.

**If you change or remove the prefix for a locale,** the change will take place for existing pages the next time you restart the site or run a task.

> The editor may appear to allow removing the prefix from the slug, but it is always restored on save.

#### If you only care about subdomains

As a convenience, if *all* of your locales use subdomains which *match the name of the locale*, you may set `subdomains: true` and skip the `hostnames` option.

#### If you only care about prefixes

Similarly, if all of your locales use prefixes which match the name of the locale, you may set `prefixes: true` rather than passing an object that spells out the prefixes for each locale.

> Of course, if you use the `hostnames` or `subdomains` option, your front end proxy must actually be configured to forward traffic for those hostnames.

#### One login across all hostnames

The workflow module provides single sign-on across all of the hostnames, provided that you use the locale picker provided by Apostrophe's editing interface to switch between them. The user's session cookie is transferred to the other hostname as part of following that link.

### Locale-specific stylesheets

Basic support for locale-specific stylesheets is provided. You may, if you wish, specify a stylesheet name for a locale. The primary purpose of such a stylesheet is to define font face imports and other global items, so that the regular LESS CSS build of Apostrophe can then use a consistent `font-family` setting for all locales but will in fact receive the correct actual font.

You may also define a `defaultStylesheet` to be pushed to all locales that do not specify a stylesheet. This is useful in cases where a single `@font-face` or `@import` declaration will serve for almost all locales, but should be overridden completely for a few specific locales to avoid redundant downloads.

```
'apostrophe-workflow': {
  locales: [
    {
      name: 'en-gb',
      label: 'England'
    },
    {
      name: 'en-us',
      label: 'United States'
    },
    {
      name: 'cn',
      label: 'China',
      stylesheet: 'cn'
    }
  ],
  defaultStylesheet: 'default'
  // other options...
}
```

Since we specified `stylesheet: 'cn'` for the `cn` locale, the project-level file `/lib/modules/apostrophe-workflow/public/css/cn.css` will be served to the browser. For all other locales, `/lib/modules/apostrophe-workflow/public/sss/default.css` will be served, because `defaultStylesheet` was also set.

It will be delivered via a special Express route and the URL will target that route. The URL will be unique to the current asset generation and locale.

> The file will not be part of a minified, CDN-delivered asset bundle. However, site-relative URLs (those beginning with `/`) will be rewritten to account for Apostrophe's `prefix` option and/or the use of an asset bundle in a CDN. Other types of relative URLs currently are not supported here. If you need to reference assets in the `public` folder of a module, use `/modules/modulename`, prefixing `modulename` with `my-` if it is in the project level `public` folder of an Apostrophe core or npm module.

This file will be pushed via a **separate `link` element in the `head`,** prior to the main, LESS-compiled spreadsheet.

This file currently **WILL NOT** be compiled with LESS, and it **MAY NOT** set LESS variables for other stylesheets to honor. Again, its primary purpose is to declare font face imports in a way that does not require excessive imports that are not needed in other locales.

### Parked pages with localized slugs

In `apostrophe-pages` configuration, you can have parked pages created automatically on server startup. The usual way is to configure a `slug` string for each parked page. If you need localized slugs, there will be a `slug` object instead:

```javascript
park: [
  {
    slug: '/',
    published: true,
    _defaults: {
      title: 'Home',
      type: 'home'
    },
    _children: [
      {
        slug: {
         'en': '/products-en',
         'fr': '/produits',
         '_default': '/products'
        },
        _defaults: {
          type: 'product-page',
          title: 'Product'
        },
        published: true,
        parkedId: 'products'
      },
    ]
  }
]
```

The slug keys must match workflow locales. Note the `_default` property for any locales not enumerated in the `slug` object. It is mandatory if at least one locale from `apostrophe-workflow` is not mentioned.
Also, the homepage (`'/'`) cannot be localized this way because prefixes can be configured in `apostrophe-workflow`.

#### Prefixes in localized slugs

They will be automatically added to the slugs defined for parked pages, even if they are localized.

For example:

```javascript
// app.js
require('apostrophe')({
  shortName: 'test',
  modules: {
    'apostrophe-workflow': {
      prefixes: {
        'en': '/en',
        'fr': '/fr',
        'de': '/de'
      }
    },
    'apostrophe-pages': {
      types: [
        {
          name: 'home',
          label: 'Home'
        },
        {
          name: 'product-page',
          label: 'Product'
        }
      ],
      park: [
        {
          slug: '/',
          published: true,
          _defaults: {
            title: 'Home',
            type: 'home'
          },
          _children: [
            {
              slug: {
              'en': '/products-en',
              'fr': '/produits',
              '_default': '/products'
              },
              _defaults: {
                type: 'product-page',
                title: 'Product'
              },
              published: true,
              parkedId: 'products'
            }
          ]
        }
      ]
    },
    product: {
      extend: 'apostrophe-pieces',
      name: 'product',
      label: 'Product'
    },
    'product-pages': {
      extend: 'apostrophe-pieces-pages'
    }
  }
});
```

With this configuration, the product page URLs created at server startup will be :
- for the `en` locale: `/en/products-en`
- for the `fr` locale: `/fr/produits`
- for the `de` locale: `/de/products`

## Workflow with permissions: limiting who can do what

The workflow module supports permissions. This tutorial breaks down how to go about setting up a site with permissions and then creating permissions groups for particular locales. We'll then add new users to each of those groups and experiment with what they can and can't do.

These features are helpful when a large team manages a site together. If your team is small and everyone might potentially work on everything, you might not choose to use these features.

### Setting up for permissions: enabling group management

First, make sure to **remove the `groups` option in the `apostrophe-users` module or comment it out:**

```javascript
// groups: [
//   {
//     title: 'admin',
//     permissions: [ 'admin' ]
//   }
// ],
```

Next, using the command line, create the `admin` group and the `admin` user:

```shell
cd /app
# Add group 'admin' with permission 'admin'.
node app.js apostrophe-groups:add admin admin
# Add user 'admin', who is a member of group 'admin'.
node app.js apostrophe-users:add admin admin
```

Now launch your site.

#### Removing the legacy groups

If you set up the site with the typical `admin`, `guest` and `editor` groups, but your plan is to give out permissions for specific locales to specific groups of people, you may wish to remove the `editor` group. You can do that via the "groups" button in the admin bar. Removing the `guest` group is optional; some find it useful for simple intranet pages.

**Do not remove the `admin` group.** You need it to log in with full privileges.

### An overview of permissions

Permissions are an important issue when working with workflow and locales. First we'll review all of the permissions you're sure to have questions about. Then we'll look at selecting locales for each permission and what that allows us to do.

#### The "Editor" permission

If you give this permission to a group, members of the group can *create and edit their own* pieces of any type, except for admin-only types like users and groups. In addition they are *candidates* to edit pages, but only if they are given permission explicitly for that page. If you do not need to distinguish between permissions for one piece type and another, this can be convenient.

#### The "Admin: All" permission

Do not give this permission to a group unless you want them to have **total control**, including making more users and giving groups more permissions.

**This permission does not present a choice of locales,** because it provides **total control** of the website.

#### "View Private Locales"

This permission restricts access to locales that are marked with `private: true`. These are the locales that the general public cannot access. Often a `default` locale is the parent of all other locales and the public cannot see it. You should generally give this permission to any group that has editing privileges on the site.

#### "Upload and Crop"

This permission is required to upload attachments to the site. You should generally give it to any group that has editing privileges on the site.

#### The "Admin: Global" permission

This refers to the shared "global" document that is often used for shared headers and footers that appear on every page of a site. If you wish a group to be able to edit this, give them the "Admin: Global" permission.

#### The "Edit: Global" permission (do not use)

The "Edit: Global" permission exists because the global document is technically a piece, but will be hidden in the interface soon. Users can't create their own new "global" doc, so this permission is not useful. See "Admin: Global" instead.

#### "Admin: Pages": total control of pages

If you give this permission to a group, members of the group can edit all of the pages on the site, subject to locale restrictions, as we'll see in a moment.

#### "Edit: Pages": candidates to edit pages

If you give this permission to a group, members of the group are *candidates* to edit pages, but only if they are given permission explicitly for that page. They can also create subpages at that point, and will have permission to edit those as well.

#### "Admin: Article": total control of articles

Users with this permission have complete control of articles (blog post pieces, as configured in the sandbox project).

#### "Edit: Article": creating and editing their own articles

Users with this permission can create and edit their own articles. They usually cannot edit anyone else's, unless custom edit permissions for pieces are specifically enabled (see the pieces module documentation).

#### "Admin: Image": total control of articles

Users with this permission have complete control of images (the image pieces that the `apostrophe-images` widget displays).

#### "Edit: Image": creating and editing their own images

Users with this permission can add and edit their own images on the site. They cannot typically edit anyone else's, although it is possible to enable custom edit permissions for pieces (see the pieces module documentation). You will usually want to give any group with editing permissions access to edit images.

#### "Edit: File": creating and editing their own files

Just like "Edit: Images", but for files such as PDFs, typically used with the apostrophe-files widget.

### Locales for permissions

After you check the box for a permission, you will be presented with a choice of locales. There is a dropdown menu for each one.

If you leave it set to "none," then members of the group cannot perform that action for content in that locale.

If you set it to "edit," then members of the group can perform that action for *draft* content in that locale, but cannot commit the content (make it live).

If you set it to "commit," then members of the group can *both* edit the draft *and* commit it and make it live.

> "Admin: All" and a few other permissions, like "view private locales" and "upload and crop," do not present a choice of locales because they are not locale-specific.

> If you are only using this module for workflow and have not set up multiple locales, you will still need to set the dropdown for the "default" locale to "edit" or "commit" for each permission.

### Permissions tutorial

This tutorial assumes you have configured a `default` parent locale and `en` and `fr` child locales. We also assume you are working with our sandbox project, which has the blog module configured with the label "Articles."

Our goal is to enable a certain group of people to edit, but not commit, the `en` locale, and another group of people to commit their changes, making them live. That second group should also be able to export those changes as new drafts in the `fr` locale.

#### Creating the fr-editors group

Log in as the admin user. Click on the admin bar. Click "Groups."

Click "Add New Group" and give it the name "fr-editors".

Now click on the "Info" tab and begin selecting permissions.

We recommend you check these boxes:

* View Private Locales
* Upload and Crop
* Edit: Page
* Edit: Image
* Edit: File
* Edit: Article

After you check each of the last four, you will see dropdowns allowing you to pick a level of control for each locale. For "fr," pick "Edit." Leave the rest set to "None."

#### Creating an "fr-editor" user

Next, click on "Users" in the admin bar. Add an "fr-editor" user. Make them a member of the "fr-editors" group by clicking the "Browse" button for "Groups." It works just like editing any other relationship in Apostrophe.

Save the user and move on to the next step.

#### Creating the "fr-committers" group

Now we'll want a group with permission to commit changes to "fr," and also export them, as drafts, to the "en" locale to explore that feature.

Follow the procedure to create a group again, name it "fr-committers," and click the "Info" tab to edit permissions.

This time, check these boxes:

* View Private Locales
* Upload and Crop
* Admin: Pages
* Admin: Image
* Admin: File
* Admin: Article

For each one, the list of locales will appear again. For "fr", pick "commit." For "en", pick "edit."

> "Why Admin: rather than Edit: this time?" Because this allows us to edit pieces that were created by **other people**. It also gives us access to all of the pages on the site for the specified locales. If you don't want this — if you want to be more restrictive, and give out permission page by page to this group — you can choose "Edit: Pages." Conversely, you can specify "Admin: Pages" for the "fr-editors" group if you wish to skip giving out permissions to them page by page.

#### Creating an "fr-comitter" user

Next, click on "Users" in the admin bar. Add an "fr-committer" user. Much like before, make them a member of the "fr-committers" group by clicking the "Browse" button for "Groups."

Save the user and move on to the next step.

#### Granting editing permissions on the home page

Now, as the admin user, switch from "Live" to "Draft." Then click "Page Menu" and "Page Settings." Now click the "Permissions" tab.

Here you can change the view and edit permissions of the home page. For "These Groups can Edit," click "Browse" and pick **both groups**.

When the option appears, set "Apply to Subpages" to "Yes." This will perform a **one-time** change of the permissions of all of the descendants of the home page. If you skip this step, you are giving out permissions on the homepage only, not its subpages.

Now save your work. Permissions for the home page have been pushed to the two new groups.

#### Working with the "fr-editors" account

Next, log out, or use an incognito window, separate browser, or separate user identity in Chrome.

Now log in as "fr-editor".

**Unless `fr` is the default locale, you won't have any editing privileges right away.** That's because we only gave them out for the `fr` locale. Click "Locales" and pick "fr".

Now you'll see edit buttons on the home page and you can edit it normally. You can also click "Submit" to request review. But, you can't commit the page.

Similarly, when you edit "Articles" via the admin bar, you can submit them, but you cannot commit them. So, you can't make changes live on your own.

#### Working with the "fr-committers" account

Now use another browser identity, or log out, and log back in as "fr-committer".

Again, you'll need to switch to "draft" mode and also switch to the "fr" locale before you see editing capabilities.

This time, you'll notice a "commit" button on the home page. And, you'll find that when you edit pieces via the admin bar, you have a "commit" option (accessed via the "workflow" dropdown in the editing dialog box for each piece).

Commit changes to make them live for the home page, and you'll see that as a logged-out site visitor you are now able to see them, provided that you have implemented a way for logged-out users to switch to the `fr` locale.

#### Exporting

After you commit a change, such as on the home page, you'll be offered the usual option to export the change. And, as "fr-committer", you will be able to check the box to export to "en" (English). However, if any other locales are present, you will not be able to check those boxes. That's because we did not give the "fr-committers" group "edit" access to those locales for pages.

#### Accessing newly created pages in other locales

Often a page or piece is created solely for use in a single locale. Technically, the page or piece exists in *every* locale. However, to avoid clutter, it is initially "trash" in other locales. So how do we make those pieces and pages live in other locales when we wish to?

For pieces, it is straightforward to switch locales, click to edit that type of piece, and pick "Yes" from the "Trash" dropdown to see the pieces that are currently considered trash. Just click to edit the piece in question, and change "Trash" to "No."

For pages, it is almost as straightforward. Click on "Pages" in the admin bar to access the "reorganize" view. Here you can locate a page in the trash at any level. Just locate its parent page, then click on the trash can displayed at that level in the tree to open the trash and find the page you want.

As with pieces, change "Trash" to "No." The "Trash" field will be located right after the "Published" field. When you click save, the page will be live in this locale.

## Removing workflow from a project

It is possible to remove workflow from a project. If you want localization and/or an approval process, you want to keep it. But if you don't want *either* of those things anymore, read on.

**WHEN YOU REMOVE WORKFLOW, ALL CONTENT IS DELETED FOREVER, EXCEPT FOR THE ONE LOCALE YOU CHOOSE TO KEEP, AND EITHER THE DRAFT OR THE LIVE CONTENT, WHICHEVER YOU CHOOSE TO KEEP.** We **strongly** recommend backing up your database with `mongodump` before you remove workflow.

This command will remove workflow from a project without locales (a project which has a "commit" button, but no language picker):

```
# Keep the live content, DISCARD the draft content
node app apostrophe-workflow:remove --live
```

You may also specify `--draft`. You may NOT specify both draft and live.

This command will remove workflow from a project with locales. ONLY THE `en` LOCALE IS KEPT IN THIS EXAMPLE. EVERYTHING ELSE IS DELETED:

```
# Keep ONLY the "draft" content fron the "en" locale
node app apostrophe-workflow:remove --locale=en --draft
```

> "Why does it work this way?" If there is no workflow module to interpret URLs across locales, or determine whether you are in draft or live mode, then there is no way to serve more than one home page, etc. If you want to keep these features, you must keep the workflow module.

### Removing workflow in production

Some notes on removing workflow from a site that is already in production:

1. Always back up the database first (`mongodump`).
2. Plan for downtime. You need to shut the site down while running the `apostrophe-workflow:remove` task so that it does not attempt to reinsert workflow-related things.
3. Run the task on the server while the site is shut down.
4. Redeploy your site with the `apostrophe-workflow` module removed from the configuration.

## Other developer concerns

### Aliasing the module

By default, optional modules like `apostrophe-workflow` do not have an alias. That means you can't just type `apos.workflow` to access them.

However, in the suggested examples above, we assume you have done this when enabling the module:

```
'apostrophe-workflow': {
  locales: [
    {
      name: 'en'
    }
  ],
  defaultLocale: 'en',
  // IMPORTANT: if you follow the examples below,
  // be sure to set this
  alias: 'workflow'
}
```

If you are using that alias for another module in your project, all of the examples above will still work. Just replace any references to `apos.workflow` with a different alias and configure that alias for the module.

### Excluding certain types and properties from workflow

You may have piece types and individual document properties that should not be subject to workflow.

For instance, the `apostrophe-user` and `apostrophe-group` piece types are automatically excluded from workflow, because they power login on the site, have permissions associated with them and are generally not intended to be displayed as frontend content.

To exclude additional types, set the `excludeTypes` option:

```javascript
'apostrophe-workflow': {
  excludeTypes: [ 'my-type-name' ]
}
```

**Note that `my-type-name` will be singular,** it matches the `name` option of your pieces module, it is **not the module name.**

You may also want to exclude individual properties. If you have a property of your pieces which only makes sense for the live locales and should not be translated either, such as a hit counter field, you will not want workflow to constantly present the "commit" button based on that difference between draft and live.

To exclude a property, write:

```javascript
'apostrophe-workflow': {
  excludeProperties: [ 'hitCounter' ]
}
```

**The property is excluded for all doc types.** Use a name that is unambiguous for such properties.

### Previewing piece types without an index page

The preview iframe displayed by the commit and history review modals works with regular pages and also with pieces that can be displayed on a page via a pieces index page, such as a blog.

For other doc types, or pieces that will never have an index page, you may optionally implement a `workflowPreview` method. Here is the implementation for `apostrophe-images`:

```javascript
self.workflowPreview = function(req, before, after) {
  return self.render(req, 'workflowPreview', { image: after });
};
```

And the `workflowPreview.html` template:

```markdown
<img
  class="apos-workflow-preview-image"
  src="{{ apos.attachments.url(data.image.attachment, { size: 'one-half' }) }}"
/>
```

If you do not supply an implementation, a message indicating that no preview is available will be displayed. A list of modified fields will still be offered to help the user understand what has changed.

### Command line tasks and workflow

#### Using the `--workflow-locale` option

By default, command line tasks that use Apostrophe's `find`, `insert` and `update` methods see and modify the content of the default locale (not the draft version of it).

You can change this by adding the `--workflow-locale` option to your command line:

```
node app my-module:my-task --workflow-locale=en
node app my-module:my-task --workflow-locale=en-draft
```

Note that you *must add the `-draft` suffix* if you want to target draft content, not live content.

### Setting the current locale programmatically

You can also choose a locale programmatically when creating a `req` object for use in a task.

Here's a way to get an "admin" `req` object that can do anything and "sees" docs in the `default` locale:

```
self.apos.tasks.getReq({ locale: 'fr' })
```

And here's a way to get an "anonymous" `req` object that can only see what the logged-out public sees:

```
self.apos.tasks.getAnonReq({ locale: 'fr' })
```

As usual, these can be used with any Apostrophe method that expects a `req` object.

### Direct MongoDB access and workflow

Code that bypasses Apostrophe's `find`, `insert` and `update` methods in favor of directly modifying the `apos.docs.db` MongoDB collection will not automatically restrict itself to the current locale.

Usually, this is perfectly fine. Many command line tasks and migrations should operate on all docs, regardless of whether they are part of a particular locale. And many direct uses of `apos.docs.db` in project-level code are already limiting an `update` operation to a specific `_id`, which will already be specific to a locale.

However, if you need to work directly with MongoDB while respecting a specific locale, you can check the `workflowLocale` property as part of your MongoDB query. The values of `workflowLocale` will match the locale name, except that *docs in draft locales will have a `-draft` suffix* appended to the locale name you were expecting.

**Since not all doc types are subject to workflow,** you may need to build your criteria like this:

```javascript
{
  $and: [
    {
      workflowLocale: {
        $in: [
          'en', null
        ]
      }
    },
    {
      // YOUR OWN CRITERIA GO HERE
    }
  ]
}
```

**Again, this is often unnecessary.** Code that is already operating on specific docs as specified by `_id` will already touch only one locale, because docs are replicated across locales with different `_id` properties. The localized versions of each doc will have **different `_id` properties, but the same `workflowGuid` property.**

In general, you should use Apostrophe's own methods rather than direct MongoDB access unless you have a compelling reason, such as access to `$set` or `$inc`. See also `setPropertiesAcrossLocales`, below, for a convenient way to access `$set`.

### `workflowModified`: must be set `true` if you make changes subject to workflow

Apostrophe automatically sets `workflowModified: true` on any draft document when it is modified via Apostrophe's `update` or `insert` APIs.

However, if you modify documents directly via MongoDB, you will need to set the `workflowModified` property to `true` yourself.

> If you missed this, and encounter difficulties later because Apostrophe does not invite the user to commit the document, you can refresh the `workflowModified` property of all draft documents by running the `apostrophe-workflow:recompute-modified` command line task. Just bear in mind that you shouldn't have to use this task on a regular basis! It is completely automatic unless (1) you have made direct modifications via MongoDB and (2) you wish the document to become "committable" in that situation.

### `setPropertiesAcrossLocales`: modifying a document programmatically across locales

The `setPropertiesAcrossLocales` method can quickly update properties of a doc across some or all locales:

```javascript
var workflow = self.apos.modules['apostrophe-workflow'];
// `doc` is a doc we already fetched normally for the current locale
return workflow.setPropertiesAcrossLocales(req, doc,
  { age: 50 },
  [ 'us', 'fr' ],
  {},
callback);
```

This call will set the `age` property to `50` in both the `us` and `fr` locales, which must be configured in the workflow module.

This affects only these two live locales. To affect both live and draft locales, write:

```
return workflow.setPropertiesAcrossLocales(req, doc,
  { age: 50 },
  [ 'us', 'fr' ],
  { mode: 'both' },
callback);
```

To affect only draft locales, write:

```
return workflow.setPropertiesAcrossLocales(req, doc,
  { age: 50 },
  [ 'us', 'fr' ],
  { mode: 'draft' },
callback);
```

To affect *all* locales:

```
return workflow.setPropertiesAcrossLocales(req, doc,
  { age: 50 },
  'all',
  {},
callback);
```

To affect all locales, but live docs only, not drafts:

```
return workflow.setPropertiesAcrossLocales(req, doc,
  { age: 50 },
  'all',
  { mode: 'live' },
callback);
```

*This method bypasses the `excludeProperties` option* and also does not invoke `docAfterSave`, etc.

"What about inserting a new doc?" A newly inserted doc is pushed to all locales, however its `trash` flag is true in all of them except the current locale. If you want the new doc to be instantly available in all locales, then after the insert is complete, you can use `setPropertiesAcrossLocales` to set the `trash` property to `false`.

### Writing safe `afterInsert` and `docAfterInsert` handlers, etc.

#### Recognizing inserts due to localization

When a document is "born" in one locale, it is immediately replicated to all others, although it will initially be in the trash in many of them.

> If the `replicateAcrossLocales` option is set to `false`, this does not occur. However documents are always replicated at least between the draft and live versions of the same locale.

In some cases, the work you do in your `beforeInsert` handlers, etc. should not be done in this situation, for instance because you are inserting many repetitions of an event, and that will already happen when the original document is created in the first locale.

You can detect this situation by looking for the `doc._workflowPropagating` property. If it is true, the document being inserted is being copied from another locale.

#### Always finish the job before continuing

If you are writing custom code that includes `afterInsert` or `afterUpdate` methods for pieces modules, or `docAfterInsert` or `docAfterUpdate` methods in any module, **and these handlers update the doc**, then your code **must complete its own work BEFORE invoking the original version of the method, or the callback.**

If you do not follow this rule when inserting a new doc, the workflow module may encounter a race condition when adding corresponding docs for other locales. In recent versions of `apostrophe-workflow`, this will result in a unique index error. In older versions it may result in duplicate docs for the same `workflowGuid + workflowLocale` combination. Either way: a bad thing.

For best results, **all** implementations of Apostrophe callbacks should wait to complete their own work before invoking the callback. It produces the most predictable result. However, you can bend this rule if you are not updating the doc itself in the database.

### Workflow event hooks

The module emits events for major workflow stagins, including `afterSubmit`, `afterCommit`, `afterExport`, `afterForceExport` and `afterForceExportWidget`. They were originally added with the intent to use them with the `apostrophe-external-notifications` module, but are generally available as needed. Each event includes data relevant to the related action, which can be captured with an event handler such as:

```javascript
// in lib/modules/apostrophe-workflow/index.js
// ...
construct: function (self, options) {
  self.on('apostrophe-workflow:afterCommit', 'logCommitData', function (req, data) {
    self.apos.utils.info('The commit data is', data);
  });
},
// ...
```

See the documentation of ["Custom Server-side Event Handlers with Promise Events"](https://docs.apostrophecms.org/apostrophe/advanced-topics/promise-events/promise-events#promise-events-reference) for more information.

#### Avoiding Express sessions for anonymous site visitors

By default, ApostropheCMS will require session storage for all site visitors, even anonymous, logged-out visitors. Of course this has a performance impact.

It can be avoided by configuring the `apostrophe-express` core module as follows:

```javascript
// in app.js
modules: {
  'apostrophe-express': {
    csrf: {
      disableAnonSession: true
    }
  }
}
```

If you choose to do this, there is one consequence for workflow: **locale switching will not work unless
either (a) you have fully distinguished all of your locales with URL prefixes and domains, or
(b) the user is logged in.** Since it is always a best SEO practice to always fully distinguish locales
in this way, you shouldn't have any problems in production with this setting. Just remember that in
early development you may not want to enable it unless you have already set up URL prefixes
for all locales.

## Technical approach

For 2.x, the draft and live versions of a doc are completely separate docs as far as most of Apostrophe is concerned. A `workflowGuid` property ties them together. This greatly reduces the scope of changes required in the rest of Apostrophe and improves performance by removing the need to move content around on every page view or load content for locales you are not looking at.

As the term locale suggests, the 2.x workflow module also implements localization of content by introducing paired live and draft locales for each country or culture you wish to support.

### Use of jsondiffpatch

This module relies somewhat on `jsondiffpatch` to calculate diffs between commits and offer a patch to be applied to the drafts of other locales. `jsondiffpatch` is also used to visualize differences in the commit modal.

Here is [documentation of how the diff deltas work](https://github.com/benjamine/jsondiffpatch/blob/master/docs/deltas.md). Our code taps into this diff output format to visualize differences.

As it turns out this algorithm is best suited to exporting changes to the schema fields of a doc.

### Patching and exporting of widgets

`jsondiffpatch` is not well suited to patching widgets and other items with globally unique ids that can be leveraged to always recognize them even if they have moved around in a document. For this reason a separate algorithm is applied first to handle exporting and patching of widgets.

## Legacy tasks

### Cleaning up duplicate homepages

If you experimented with the pre-npm-publication Apostrophe 2.x version of this module before 2017-07-26, you may need to clean up duplicate homepages created by the parked page mechanism before it was made locale-aware. If you suffer from this problem you will likely see that the "reorganize" view does not show any children of the home page.

**No one else should ever need this task for any reason, and you should only need it once.**

You can fix the issue with this command line task:

```
node app apostrophe-workflow:remove-numbered-parked-pages
```

**This task will permanently remove all "parked" pages with a slug that ends in one or more digits**. By default the only parked pages are `/` and `/trash`, neither of which should ever end in a digit. If your custom configuration of parked pages includes pages with slugs that *should* end in a digit, this task is not suitable for you as written. But again, you almost certainly do not need it, unless you were a user of this module prior to 2017-07-26.

## Additional options

The following additional options can be set on the `apostrophe-workflow` module to adjust the default behavior.

### `defaultMode`

By default, when a user logs in, they are in `draft` mode beginning in version 2.31.0. However, if this does not suit your use case, you may set `defaultMode` to `draft`, `live` or `preview`. Choosing `live` may make the most sense if the user cannot access a locale they are actually allowed to edit until they have logged in, but in most cases being able to edit immediately is the superior choice.

