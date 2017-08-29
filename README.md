## Overview

The `apostrophe-workflow` module adds powerful workflow and localization capabilities to Apostrophe. As a workflow system it provides for a draft version of every document, so that changes do not immediately "go live." As a localization system it provides for documents to exist in several locales, allowing for easy internationalization.

We'll begin with the steps needed simply to add workflow to your project. Then we'll examine the changes needed for localization (also known as internationalization).

## npm

```
npm install --save apostrophe-workflow
```

## app.js

In `app.js`, configure the `apostrophe-workflow` module with the rest. We'll start with a simple configuration just providing workflow:

```
'apostrophe-workflow': {
  // IMPORTANT: if you follow the examples below,
  // be sure to set this so the templates work
  alias: 'workflow'
}
```

## Adding workflow to your database

Odds are, you already have a database. Either from an existing project, or for a new one, since Apostrophe creates the database on the very first run. So, follow these steps to add workflow to your database.

1. **FOR EXISTING PROJECTS, BACK UP YOUR DATABASE,** In case you decide this module is not for you, or decide you should have used the `--live` option as seen below. Currently there is no command to stop using workflow once you start.

You should initially experiment with this module with a *local* copy of your site, not your live production content.

You can back up your database easily with the `mongodump` command line utility.

2. Execute this task:

```
node app apostrophe-workflow:add-missing-locales --live
```

**You should not have to do this more than once,** except when adding new locales (see "localization" below).

Once you run this task, all of your documents will exist in both draft and live versions. Editors will be able to the draft version while in "draft" mode. Everyone else, and editors in "live" mode, will see the live version and will not be able to edit it directly. The only way to make new content live is to "commit" the changes that have been made to the document.

If you have not added an admin user yet, you can do it now in the usual way:

```
node app apostrophe-users:add admin admin
```

## Using Workflow

This basic configuration provides you with a live/draft toggle on the page (lower left corner). Editing is not possible in the live mode. You will not see most types of pieces in the admin bar, and you will not see editing controls on the page. This is normal.

In the draft mode, editing works in a familiar way. Your changes are constantly saved, just like before, but they are only saved to the draft version of the document.

When you are satisfied, click "submit" to submit your work for review by someone else, or "commit" to commit it to the live version of the page yourself. 

If work is submitted that you have permission to edit, you can view a list of those pages and pieces via the "Workflow" admin bar menu.

## "Why am I asked to commit so many things?"

When you click "Commit" on the page, all of the documents that make up what you see on the page need to be committed in order to go live on the site. That includes the images in a slideshow, the blog posts in a blog widget, and so on. It may seem like a lot of work the first time. Just remember that you won't be asked to commit them again unless their drafts have been updated.

## Workflow for pieces

"Pieces," like blog posts or events, work just like before. However, just make sure you enter "draft" mode; until you do that most piece types won't show up on the admin bar, because you can only edit the draft version directly.

When you are finished editing a piece, use the "workflow" menu in the upper right corner of the dialog box to select "submit" or "commit."

## Workflow for page settings

Workflow also applies to page settings, such as the title. You can easily toggle between displaying the draft and live versions of the title while in the page settings dialog box. And, you can submit or commit via the workflow dropdown menu in the upper right corner of the dialog box.

## Localizing and internationalizing websites

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
  defaultLocale: 'default',
  // IMPORTANT: if you follow the examples below,
  // be sure to set this
  alias: 'workflow'
}
```

If you have worked with localization before you will recognize locale names like `en-gb`. These are arbitrary; you may choose any name. However, if you plan to use URL prefixes to distinguish between locales (see below), you must choose a hyphenated, lower-case name without punctuation. So we suggest that you always do that.

> "What about the `default` locale? What does `private` do?" Private locales cannot actually be accessed by the public. Although it isn't mandatory, we recommend setting up a private `default` locale for the "master copy" of your content, written in your team's most familiar language, and then exporting content to child locales.
>
> Note that if you do not have a locale named `default`, you must set the `defaultLocale` option to the name of a locale you do have. Also note that if you started out with no locales for simple workflow, Apostrophe already created a `default` locale implicitly. Leaving that out of your locale configuration would give you no way to access the existing content.
>
> The parent-child relationship between locales is just a convenience for quickly exporting content to them, as you'll see below. You can nest `children` as many levels deep as you wish.

Now let's ask Apostrophe to add the new locales to all of the existing docs in the database:

```
node app apostrophe-workflow:add-missing-locales
```

By default, docs copied to new locales via this task will be considered trash in all locales except for the draft version of the default locale, until an editor chooses to clear the "trash" checkbox and then commit that change. If you prefer that that they be immediately live everywhere, use this command instead:

```
node app apostrophe-workflow:add-missing-locales --live
```

Now access the site as an administrator. You will be able to click on the current locale name to switch to other locales.

> Every document automatically exists in all locales, however it may or may not be published or in the trash in any given locale. This is useful since it allows you to have pages that are "only for France," for instance.

Note that a single document may have a different slug in different locales. The slugs may also be the same, but you'll typically want to enable locale-specific prefixes, locale-specific domain names or a combination of the two as described below.

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

This `ul` will populate with localized links to the current context page or piece. If the page or piece is unpublished or considered trash in a locale, there won't be a link for that locale.

If you use `localization.label` as shown here, you'll see the labels that you set when configuring your locales.

If you use `localization.title` instead, you'll see the title of the individual piece or page as it was translated or localized for that locale. The former is usually less confusing.

This code:

`| build({ workflowLocale: localization.workflowLocale })`

May be omitted if you are using the `subdomains` feature or the `prefixes` feature. If you are using neither, then a query parameter is necessary as the slugs could be the same across locales. However the query parameter is automatically removed after the new locale is stored in the user's session.

## Exporting between locales

After committing a change, you will be invited to export that change to other locales. If you do so, it is applied as a "patch" to the other locale's draft (it is not made live right away).

This allows for editors fluent in the other locale to complete any necessary translation tasks before finally committing the changes for that locale.

### Not all patches can be exported

If the page has been altered greatly in structure, for example if the rich text widget on a page has been removed and replaced, making it effectively a separate widget altogether, then an edit to that widget will not take effect as a patch. It is a best practice to initially create all content in a "default" locale and then export it to others.

## Forcing exports

If you need to, you can force an export of a document so that it is copied directly to the draft version in other locales. To do that, choose "Force Export" from the dialog box for the piece in question, or from the "Page Settings" dialog box for a page.

> Even a forced export only alters the draft version of the other locales. Work must still be reviewed and committed there.

## Forcing export of one widget

You can also force the export of a single widget. You can do that via the new export button, displayed along with the up and down arrows, edit pencil and trash icon. This will always push that widget to the draft version of the document in other locales, as long as it can be found there.

## Switching locales via custom hostnames and/or prefixes

You'll want URLs to be different between locales so that there is no ambiguity when a user shares them.

You can do so by setting the `hostnames` and/or `prefixes` options. Notice that these are separate from the main `locales` array. This is done to make it easier to differentiate the hostnames between development, staging and production environments using a `data/local.js` file that is present only in the proper environment. Apostrophe merges the contents of that file with your main `app.js` Apostrophe configuration using `_.merge()`, which works best with objects and properties.

Notice that **a hostname is specified for every locale, and if a hostname is shared by two or more locales, all of those locales must specify prefixes.**

*There does not have to be any similarity between the hostnames.* They can be completely different.

Two locales may have the same prefix, as long as they have different hostnames, and vice versa.

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
        // Even private locales must be distinguishable by hostname and/or prefix
        'default': '/default',
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

### Adding prefixes to an existing database

Apostrophe does not automatically add prefixes to existing slugs in your database when you enable prefixes for locales. You can do so with this command line task:

```
node app apostrophe-workflow:add-locale-prefixes
```

This is a one-time action.

There is currently no task to remove prefixes if you choose to stop using them. However, after the prefix configuration is removed, it becomes possible to edit the slug fully and remove the prefix by hand.

### If you only care about subdomains

As a convenience, if *all* of your locales use subdomains which *match the name of the locale*, you may set `subdomains: true` and skip the `hostnames` option.

### If you only care about prefixes

Similarly, if all of your locales use prefixes which match the name of the locale, you may set `prefixes: true` rather than passing an object that spells out the prefixes for each locale.

> Of course, if you use the `hostnames` or `subdomains` option, your front end proxy must actually be configured to forward traffic for those hostnames.

### One login across all hostnames

The workflow module provides single sign-on across all of the hostnames, provided that you use the locale picker provided by Apostrophe's editing interface to switch between them. The user's session cookie is transferred to the other hostname as part of following that link.

You **do not** have to run this task again. It is a one-time transition.

Currently there is no automated way to roll back to not having slug prefixes. However, if you disable the `prefixes` flag, the entire slug becomes editable again, and so you can manually remove them.

*The editor may appear to allow removing the prefix from the slug, but it is always restored on save.*

## Workflow with permissions: limiting who can do what

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

### Accessing newly created pages in other locales

Often a page or piece is created solely for use in a single locale. Technically, the page or piece exists in *every* locale. However, to avoid clutter, it is initially "trash" in other locales. So how do we make those pieces and pages live in other locales when we wish to?

For pieces, it is straightforward to switch locales, click to edit that type of piece, and pick "Yes" from the "Trash" dropdown to see the pieces that are currently considered trash. Just click to edit the piece in question, and change "Trash" to "No."

For pages, it is almost as straightforward. Click on "Pages" in the admin bar to access the "reorganize" view. Here you can locate a page in the trash at any level. Just locate its parent page, then click on the trash can displayed at that level in the tree to open the trash and find the page you want.

As with pieces, change "Trash" to "No." The "Trash" field will be located right after the "Published" field. When you click save, the page will be live in this locale.

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

## Legacy task: cleaning up duplicate homepages

If you experimented with the pre-npm-publication Apostrophe 2.x version of this module before 2017-07-26, you may need to clean up duplicate homepages created by the parked page mechanism before it was made locale-aware. If you suffer from this problem you will likely see that the "reorganize" view does not show any children of the home page.

**No one else should ever need this task for any reason, and you should only need it once.**

You can fix the issue with this command line task:

```
node app apostrophe-workflow:remove-numbered-parked-pages
```

**This task will permanently remove all "parked" pages with a slug that ends in one or more digits**. By default the only parked pages are `/` and `/trash`, neither of which should ever end in a digit. If your custom configuration of parked pages includes pages with slugs that *should* end in a digit, this task is not suitable for you as written. But again, you almost certainly do not need it, unless you were a user of this module prior to 2017-07-26.
