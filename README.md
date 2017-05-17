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
  defaultLocale: 'en'
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

```
node app apostrophe-workflow:add-missing-locales
```

**You should not have to do this more than once,** except when adding new locales (see "localization" below).

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
      name: 'en'
    },
    {
      name: 'fr'
    }
  ],
  defaultLocale: 'en'
}
```

Now ask Apostrophe to add the new locales to all existing docs in the database:

```
node app apostrophe-workflow:add-missing-locales
```

You can now click the locale code, also in the lower left corner, to switch to the other locale. Each locale has live and draft modes. Every doc automatically exists in all locales, however it may or may not be published in any given locale. [TODO: see ]

Note that a single document may have a different slug in different locales. They may also be the same.

## Switching locales on the front end

You may build locale-switching UI by adding a `workflowLocale` query parameter to any URL. However, since slugs can diverge for the ame document, you will want the rest of the URL to already be correct for the target locale. You can currently obtain this information via this method:

```
return apos.modules['apostrophe-workflow'].getLocalizations(
  req, (req.data.piece || req.data.piece).workflowGuid, callback) { ... }
);
```

Your callback will receive `(null, localizations)`, where `localizations` is an object like this:

```
{
  en: {
    title: 'Welcome',
    _url: '/'
  },
  fr: {
    title: 'Bienvenue',
    _url: '/'
  }
}
```

You can use these properties to build a locale switcher on the front end.

TODO: [this is too hard, we should do it for you. See #26 for status of an easier way.](https://github.com/punkave/apostrophe-workflow/issues/26)

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
              name: 'fr'
            },
            {
              name: 'ch',
              children: [
                {
                  name: 'ch-fr'
                },
                {
                  name: 'ch-it'
                },
                {
                  name: 'ch-de'
                },
              ]
            }
          ]
        },
        {
          name: 'na',
          children: [
            {
              name: 'us'
            }
          ]
        }
      ]
    }
  ],
  defaultLocale: 'default'
}
```

**In the final implementation, only locales without children will ever be publicly visible.** Higher nodes in the tree should be used to create draft content with a consistent structure and push it downwards toward the leaf nodes for localization and review. [See #25 for status of implementation.](https://github.com/punkave/apostrophe-workflow/issues/25)

Content may also be pushed upwards via the export feature if you have permission to edit drafts for the higher locales in the tree, however bear in mind that the risk of divergence that makes patching difficult is decreased when working from the top down.

## Automatically switching locales via URL prefixes and subdomains

TODO: it is our intention to support both of these scenarios. [See issue #28 for status.](https://github.com/punkave/apostrophe-workflow/issues/28)

## Technical approach

For 2.x, the draft and live versions of a doc are completely separate docs as far as most of Apostrophe is concerned. A `workflowGuid` property ties them together. This greatly reduces the scope of changes required in the rest of Apostrophe and improves performance by removing the need to move content around on every page view or load content for locales you are not looking at.

As the term locale suggests, the 2.x workflow module also implements localization of content.
  
### Use of jsondiffpatch

This module relies on `jsondiffpatch` to calculate diffs between commits and offer a patch to be applied to the drafts of other locales. `jsondiffpatch` is also used to visualize differences in the commit modal.

Here is [documentation of how the diff deltas work](https://github.com/benjamine/jsondiffpatch/blob/master/docs/deltas.md). Our code taps into this diff output format to visualize differences.

