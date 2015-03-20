# apostrophe-workflow

Provides approval-based workflow for projects that need it. An optional component of the [Apostrophe](http://apostrophenow.org/) content management system.

## What is workflow?

"Workflow" is a way to ensure that:

* No change goes live without the chance for the author to review it.
* Changes made by a large team can be reviewed by a smaller group for consistency and accuracy.

## Do you want workflow?

We encourage our customers to trust their staff and consider the impact of approval systems on their productivity.

However some projects, like a medical or legal site, do have a very high cost associated with an accidental mistake in editing.

Other projects may have hundreds of contributors, creating a risk that there will be no consistency in tone and message.

This module is intended primarily for projects that face these special challenges.

## Installation

```bash
npm install --save apostrophe-workflow
```

## Configuration

In `app.js`, in your top-level configuration of `apostrophe-site`, you must set `workflow: true`.

You must *also* enable the `apostrophe-workflow` module.

```javascript
workflow: true,
modules: {
  // Various others...
  apostrophe-workflow: {}
}
```

In `outerLayout.html`, you must add the workflow manager menu and the workflow context menu. The manager menu is part of the admin bar, while the context menu is displayed to the right of the page context menu because it relates to the content currently on the screen.

```nunjucks
{# Various module admin menus, then... #}
{{ aposWorkflowManagerMenu(permissions) }}

{# ... Further down where we output the pages menu ... #}

{{ aposPagesMenu({ contextMenu: contextMenu, page: page, bottom: true }) }}
{# Show workflow context menu only on pages we can edit #}
{% if contextMenu %}
  {{ aposWorkflowMenu({}) }}
{% endif %}
```

## Using Workflow

Once the workflow module and the `workflow` flag are *both* enabled, the following changes come into play:

* When editing permissions for individual groups and people with regard to individual pages, there is a "can publish" checkbox.
* If this box is not checked the user cannot access most of the context menu. They can still add new subpages, but they are initially unpublished.
* There is a new menu at the bottom of the screen next to the context menu, with "Draft," "Public" and "Approve Changes" buttons.
* Initially editors are in "public" mode. They see what is already published on the site and they cannot edit directly in this view.
* When editors toggle to "draft" mode, they can see unpublished changes, and make new edits.
* When an editor is satisfied with their own work, they click "Approve Changes."
* If the editor has the "Can Publish" box checked in the edit permissions of the page, or the editor is an admin, their changes are immediately made live at this point.
* If the editor doesn't have publishing permissions, their work is flagged for the attention of someone who does.
* Admins and editors who do have publishing privileges can see a list of all pages with changes requiring approval by selecting "Workflow" from the admin menu.
* Clicking the links in that list takes you to the page in question.
* The admin, or editor with publishing privileges, then reviews the content in "draft" mode, makes any necessary edits and clicks "Approve Changes" to make the changes live.

## Working Example

Try checking out the `workflow` branch of the [Apostrophe sandbox](https://github.com/punkave/apostrophe-sandbox) from github.

## Requiring publishers to submit their changes

By default, if you can publish a page, then you can make your own draft changes live by clicking the approval button.

If you wish, you can require publishers to submit their own work for approval by another publisher. **Note that this only makes sense if you reliably have a second person available to approve their work.**

Instead of `workflow: true`, just enable workflow this way:

```javascript
workflow: {
  forPublishers: true
}
```

## Limitations

The workflow module does not currently address revisions to snippets. Instead, individuals who are not admins of a snippet type will find that their snippets are always drafts until an admin publishes them.

However you can set `editorsCanPublish` to `true` when configuring any snippet subclass to override this rule.

Note that the workflow module *does* work well out of the box with [apostrophe-blog-2](https://github.com/punkave/apostrophe-blog-2), which represents articles as pages.
