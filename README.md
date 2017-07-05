## Status

Functional, but very much a work in progress.

## Installation

First, try starting with this branch of our sandbox project:

```
git clone -b workflow-2 https://github.com/punkave/apostrophe-sandbox
```

This will give you a test project with correctly configured dependencies and settings for various locales immediately.

Read on for instructions that should suffice when starting from an existing or new project.

### Packages

For now, add the 2.x branch as a git dependency in `package.json`. You currently must also add the relevant branch of Apostrophe:

```
  "apostrophe": "punkave/apostrophe#workflow-accommodations-1",
  "apostrophe-workflow": "punkave/apostrophe-workflow#2.x"
```

This is very temporary; these branches will be merged to master and published to npm as the APIs stabilize.

Run `npm install` after adding the dependencies.

### app.js

In `app.js`, configure your module with the rest. We'll configure a single "locale" for our English-language site:

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
},
// For now you must separately configure this flag
// for the `apostrophe-docs` module
'apostrophe-docs': {
  trashInSchema: true
}
```

Behind the scenes, Apostrophe will automatically create a second "locale," `en-draft`, used for draft copies of each doc. This "draft" locale is not publicly accessible.

*If you don't configure `locale` and `defaultLocale`, a locale named `default` is created.* However, this doesn't give you the best upgrade path if you add localization to your project later and don't wish to have a top-level "default" locale that is never public. So we recommend a locale name that reflects the language of the site, unless you plan on a nested tree of locales with a "default" at the top (see below for examples).

## Reset your database or run the appropriate task

If you are starting from scratch but may have accidentally typed `node app` before enabling workflow, you might want to erase your database and start over (DO NOT DO THIS IN PRODUCTION EVER):

```
node app apostrophe-db:reset
```

Or, to add workflow support to an existing project database:

1. **BACK UP YOUR DATABASE,** In case you decide this module is not for you, or decide you should have used the `--live` option as seen below. Currently there is no task to stop using workflow. You should initially experiment with this module with a *local* copy of your site, not your live production content.

2. Execute this task:

```
node app apostrophe-workflow:add-missing-locales
```

By default, docs will be considered trash in their "live" version, as opposed to the draft version, until they are committed for the first time. If you prefer that that they be immediately live in the "live" version, use:

```
node app apostrophe-workflow:add-missing-locales --live
```

**You should not have to do this more than once,** except when adding new locales (see "localization" below).

If you have not added an admin user yet, do it in the usual way:

```
node app apostrophe-users:add admin admin
```

*Workflow permissions for less privileged users are a work in progress.*

## Using Workflow

This basic configuration provides you with a live/draft toggle on the page (lower left corner). Editing is not possible in the live mode.

In the draft mode editing works normally. Click "submit" to submit your work for review by someone else, or "commit" to commit it to the live version of the page yourself. 

If work is submitted that you have permission to edit, you can view a list of those pages and pieces via the "Workflow" admin bar menu.

## Using Localization

To enable localization, configure more than one locale in `app.js`:

```
'apostrophe-workflow': {
  locales: [
    {
      name: 'en',
      label: 'English'
    },
    {
      name: 'fr',
      label: 'French'
    }
  ],
  defaultLocale: 'en',
  // IMPORTANT: if you follow the examples below,
  // be sure to set this
  alias: 'workflow'
}
```

Now ask Apostrophe to add the new locales to all existing docs in the database:

```
node app apostrophe-workflow:add-missing-locales
```

By default, docs copied to new locales via this task will be considered trash in all locales except for the draft version of the default locale, until they are committed for each locale for the first time. If you prefer that that they be immediately live everywhere, even though they are not translated yet, use:

```
node app apostrophe-workflow:add-missing-locales --live
```

You can now click the locale code, also in the lower left corner, to switch to the other locale. Each locale has live and draft modes. Every doc automatically exists in all locales, however it may or may not be published in any given locale. [TODO: see ]

Note that a single document may have a different slug in different locales. They may also be the same.

## Building a locale picker on the front end

Here's how to code a locale picker on the front end:

```markup
{# Typically in `layout.html` #}
<ul>
  {% for localization in apos.workflow.localizations() %}
    <li><a href="{{ localization._url | build({ workflowLocale: localization.workflowLocale }) }}">{{ localization.label }}</a></li>
  {% endfor %}
</ul>
```

This `ul` will populate with localized links to the current context page or piece.

If you use `localization.label` as shown here, you'll see the labels that you set when configuring your locales.

If you use `localization.title` instead, you'll see the title of the individual piece or page as it was translated or localized for that locale.

This code:

`| build({ workflowLocale: localization.workflowLocale })`

May be omitted if you are using the `subdomains` feature or the `prefixes` feature. If you are using neither, then a query parameter is necessary as the slugs could be the same across locales. However the query parameter is automatically removed after the new locale is stored in the user's session.

## Exporting between locales

After committing a change, you will be invited to export that change to other locales. If you do so, it is applied as a "patch" to the other locale's draft (it is not made live right away).

This allows for editors fluent in the other locale to complete any necessary translation tasks before finally committing the changes for that locale.

### Not all patches can be applied

If the page has been altered greatly in structure, for example if the rich text widget on a page has been removed and replaced, making it effectively a separate widget altogether, then an edit to that widget will not take effect as a patch. It is a best practice to initially create all content in a "default" locale and then export it to others.

## Nested locales

Locales can be nested, creating a convenient tree from which to select them or navigate among them. Here is a more complex configuration with many child locales:

```
'apostrophe-workflow': {
  locales: [
    {
      name: 'default',
      children: [
        {
          name: 'eu',
          children: [
            {
              name: 'fr',
              label: 'French'
            },
            {
              name: 'ch',
              children: [
                {
                  name: 'ch-fr',
                  label: 'Swiss French'
                },
                {
                  name: 'ch-it',
                  label: 'Swiss Italian'
                },
                {
                  name: 'ch-de',
                  label: 'Swiss German'
                },
              ]
            }
          ]
        },
        {
          name: 'na',
          children: [
            {
              name: 'us',
              label: 'United States'
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

**In the final implementation, only locales without children will ever be publicly visible.** Higher nodes in the tree should be used to create draft content with a consistent structure and push it downwards toward the leaf nodes for localization and review. [See #25 for status of implementation.](https://github.com/punkave/apostrophe-workflow/issues/25)

Content may also be pushed upwards via the export feature if you have permission to edit drafts for the higher locales in the tree, however bear in mind that the risk of divergence that makes patching difficult is decreased when working from the top down.

## Automatically switching locales via subdomains

You can enable automatic locale switching based on the subdomain. Simply use subdomains that match your locale names, such as `fr.example.com`, and set the `subdomains` option to `true` when configuring this module.

When you do so, URL generation for pages, pieces, etc. also gains an automatic subdomain prefix.

Some locales may not be intended for public use, such as a root "default" locale from which you export changes to sublocales. For these, set `private: true` when configuring them, so they cannot be reached at all by the general public:

```
'apostrophe-workflow': {
  subdomains: true,
  locales: [
    {
      name: 'default',
      private: true,
      children: [ ... ]
    }
  ]
}
```      

*Yes, a private locale may have public sub-locales.*

### One login across all subdomains

Although there is just one database of accounts, by default, the session cookie used by Apostrophe is not shared across subdomains. You can address this by configuring the `apostrophe-express` module. **Just as an example**, the domain name to be shared here is `workflow.com`:

```javascript
'apostrophe-express': {
  session: {
    secret: 'yoursecretgoeshere',
    cookie: {
      domain: 'workflow.com'
    }
  }
},
````

## Automatically switching locales via prefixes

Alternatively, you can enable automatic locale switching based on the subdomain. Simply set the `prefixes` option to true.

> You cannot use `subdomains` and `prefixes` at the same time.

If your database already exists, you must run the following **one-time** task to prefix the slugs of existing pages:

```
node app apostrophe-workflow:add-locale-prefixes
```

You **do not** have to run this task again. It is a one-time transition.

Currently there is no automated way to roll back to not having slug prefixes. However, if you disable the `prefixes` flag, the entire slug becomes editable, and so you can manually remove them.

## Technical approach

For 2.x, the draft and live versions of a doc are completely separate docs as far as most of Apostrophe is concerned. A `workflowGuid` property ties them together. This greatly reduces the scope of changes required in the rest of Apostrophe and improves performance by removing the need to move content around on every page view or load content for locales you are not looking at.

As the term locale suggests, the 2.x workflow module also implements localization of content by introducing paired live and draft locales for each country or culture you wish to support.
  
### Use of jsondiffpatch

This module relies somewhat on `jsondiffpatch` to calculate diffs between commits and offer a patch to be applied to the drafts of other locales. `jsondiffpatch` is also used to visualize differences in the commit modal.

Here is [documentation of how the diff deltas work](https://github.com/benjamine/jsondiffpatch/blob/master/docs/deltas.md). Our code taps into this diff output format to visualize differences.

As it turns out this algorithm is best suited to exporting changes to the schema fields of a doc.

### Patching and exporting of widgets

`jsondiffpatch` is not well suited to patching widgets and other items with globally unique ids that can be leveraged to always recognize them even if they have moved around in a document. For this reason a separate algorithm is applied first to handle exporting and patching of widgets.

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
