## Status

Rapidly maturing. The technical approach has been locked down. Some minor refactoring is still in progress. We expect to publish it as 2.0.0 soon.

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

## Workflow with permissions

The workflow module supports permissions. This tutorial breaks down how to go about setting up a site with permissions and then creating permissions groups for particular locales. We'll then add new users to each of those groups and experiment with what they can and can't do.

These features are helpful when a large team manages a site together. If your team is small and everyone might potentially work on everything, you might not choose to use these features.

### Setting up the site: enabling group management

First, launch your site with the usual `groups` setting for the `apostrophe-users` module, or with this minimal one:

```javascript
groups: [
  {
    title: 'admin',
    permissions: [ 'admin' ]
  }
],
```

Now, **if you haven't already,** follow the usual procedure to add a single user to the `admin` group:

```
node app apostrophe-users:add admin admin
```

Then, **remove the `groups` option or comment it out:**

```javascript
// groups: [
//   {
//     title: 'admin',
//     permissions: [ 'admin' ]
//   }
// ],
```

Now restart the site. This will enable the user interface in the admin bar for managing groups. (We plan to add command-line tasks for creating an admin group as an alternative to temporarily setting the `groups` option.)

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
