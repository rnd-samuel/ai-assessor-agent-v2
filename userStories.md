AI Assessor Agent - User Stories

This document is the single source of truth for all application features, organized by Epic. Stories are assigned to the lowest applicable role, with higher roles inheriting all permissions from lower roles (Admin > Project Manager > User).

Core Principles

Hierarchy: Admin > Project Manager > User.

Feedback (Snappy): The system must always provide feedback for asynchronous actions. Every When step that involves a data request (fetch, save, generate, upload) must be followed by a Then step that shows a loading state (e.g., spinner, skeleton, button disabled with loader).

Reliability: All asynchronous actions must be wrapped in error handling. A user-friendly error message (e.g., a toast/notification) must be shown if an operation fails.

Consistency: All common components (modals, buttons, notifications) will follow the design system.html specification.

Glossary & Definitions

Competency Dictionary: A guide containing competency definitions, levels with their description, and key behaviors (KBs).

Simulation Method: The assessment tool (e.g., case study, role play).

Simulation Method Data: The details of a specific assessment tool (e.g. case and questions of a case study simulation, role and context of a role play simulation).

Assessment Results: The assessee's answers/transcripts.

Project KB: The project-specific knowledge base (RAG).

Global KB: The application-wide knowledge base (RAG).

Toast: A non-intrusive notification panel (as seen in the design system) used for success, error, or info messages (e.g., "Report saved," "Generation complete").

Epic: 1.0 Authentication

Story: AUTH-1.1: User Login

Story: As a User, I want to log in with my email and password so that I can access the application.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Scenario 1: Successful Login

Given I am on the /login page

When I enter my correct email and password

And I click the "Log In" (Primary) button or press "Enter"

Then the "Log In" button shows a loading spinner and is disabled.

And I am redirected to the /projects-dashboard page.

Scenario 2: Incorrect Credentials

Given I am on the /login page

When I enter an incorrect email or password

And I click the "Log In" button

Then the "Log In" button shows a loading spinner and is disabled.

And the button state returns to normal.

And an error message is displayed: "E-mail or Password is incorrect. Please try again."

Scenario 3: Empty Fields

Given I am on the /login page

When I have not filled in both the email and password fields

Then the "Log In" button is disabled.

Story: AUTH-1.2: Password Reset

Story: As a User, I want to reset my password if I've forgotten it so that I can regain access to my account.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Scenario 1: Request Password Reset

Given I am on the /login page

When I click the "Forgot Password?" (Ghost) button

Then I am prompted to enter my email address.

When I enter my email and click "Submit"

Then a loading indicator is shown.

And a confirmation message is displayed: "If an account exists for that email, a password reset link has been sent."

Epic: 2.0 Global UI & Navigation

Story: GBL-2.1: View Persistent Sidebar

Story: As a User, I want to see a persistent sidebar so that I can navigate the application.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I am logged in

Then the sidebar is always visible on the left.

And the sidebar contains the app name at the top.

And the sidebar contains a "Projects Dashboard" navigation button.

And the sidebar contains a "Log Out" (Ghost) button at the bottom.

Story: GBL-2.2: Collapse/Expand Sidebar

Story: As a User, I want to collapse and expand the sidebar so that I can maximize my screen space.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given the sidebar is expanded

When I click the hamburger icon at the top

Then the sidebar collapses to only show icons.

When I click the hamburger icon again

Then the sidebar expands to its full width.

Story: GBL-2.3: Sidebar Navigation (User)

Story: As a User, I want to see navigation links to all projects I am invited to so that I can quickly access them.

Roles: User

Acceptance Criteria:

Given I am a User

Then the sidebar displays a sub-navigation list of all projects I am invited to, under the "Projects Dashboard" button.

When I click a project sub-navigation button

Then I am navigated to the /projects/{id}/reports page for that project.

Given I have not been invited to any projects

Then no project sub-navigation buttons are shown.

Story: GBL-2.4: Sidebar Navigation (Project Manager)

Story: As a Project Manager, I want to see links to projects I created or am invited to, and a link to create a new project.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am a Project Manager or Admin

Then a "+ New Project" button is visible in the sidebar.

When I click the "+ New Project" button

Then I am navigated to the /projects/new page.

And the sidebar displays a sub-navigation list of all projects I am invited to or have created.

Story: GBL-2.5: Sidebar Navigation (Admin)

Story: As an Admin, I want a link to the Admin Panel so that I can manage the application.

Roles: Admin

Acceptance Criteria:

Given I am an Admin

Then an "Admin Panel" button is visible in the sidebar (below project links).

When I click the "Admin Panel" button

Then I am navigated to the /admin/dashboard page.

Story: GBL-2.6: Unsaved Changes Modal

Story: As a User, I want to be warned before leaving a page with unsaved changes so that I don't accidentally lose my work.

Roles: User, Project Manager, Admin

Applies to: New Project Page, New Report Page, Report Page, Admin (Competency Dictionary Edit)

Acceptance Criteria:

Given I am on a page with unsaved changes (e.g., Report Page, New Project Page)

When I attempt to navigate away (click sidebar link, close tab, click 'Cancel')

Then a confirmation modal appears.

And the modal title is "Unsaved Changes".

And the modal message is "Are you sure you want to leave? Any unsaved changes will be lost."

And the modal has two buttons: "Stay" (Secondary) and "Leave" (Destructive).

When I click "Stay"

Then the modal closes and I remain on the page.

When I click "Leave"

Then the modal closes and the navigation action proceeds.

Story: GBL-2.7: AI Generation Notification

Story: As a User, I want to be notified when a long-running AI task is complete so that I know when I can review the content.

Roles: User, Project Manager, Admin

Implementation Note: This uses bullmq for background processing.

Acceptance Criteria:

Given I have triggered an asynchronous AI generation (e.g., "Generate Report")

And I have navigated away from the Report Page

When the AI generation is complete

Then a success toast notification appears at the bottom-right corner of my current page.

And the toast message says "AI generation for 

$$Report Title$$

 is complete."

Epic: 3.0 Projects Dashboard (/projects-dashboard)

Story: PD-3.1: View Projects Dashboard

Story: As a User, I want to view a dashboard of all my projects so that I can navigate to them.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I am logged in

Then I am directed to the "Projects Dashboard" page by default.

And the page title "Projects Dashboard" is visible.

And a search bar is visible above the project list.

Story: PD-3.2: View Project List (User)

Story: As a User, I want to see a list of projects I am invited to so that I can select one to work on.

Roles: User

Acceptance Criteria:

Given I am a User

And I am on the Projects Dashboard

When the page loads

Then a loading state (e.g., table skeleton) is shown.

And a list of projects I am invited to is displayed in a table with columns: "Date" (creation), "Name", "No. of reports" (count of my reports in this project, shows "-").

Given I have not been invited to any projects

Then the table is empty and shows the message: "You have not been invited to any projects. Please contact the admin for further details."

Story: PD-3.3: View Project List (Project Manager / Admin)

Story: As a Project Manager, I want to see projects I created or am invited to, with archive options.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am a Project Manager or Admin

When the Projects Dashboard page loads

Then a loading state is shown.

And a list of projects I created or am invited to is displayed in a table with columns: "Date", "Name", "No. of reports" (total reports in project), "Archive" (button), Checkbox.

Given I have not been invited to or created any projects

Then the table is empty and shows the message: "You have not been invited to any projects. Please create a new project or contact the admin for further details."

Story: PD-3.4: Interact with Project List

Story: As a User, I want to sort, filter, and navigate my project list.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Scenario 1: Sort List

Given I can see the project list

When I click any column header

Then the table sorts by that column (ascending).

When I click the same header again

Then the table sorts by that column (descending).

Scenario 2: Filter List

Given I can see the project list

When I type "Alpha" into the search bar

Then the list filters to only show projects with "Alpha" in the name.

Scenario 3: Navigate to Project

Given I can see the project list

When I click on a project row

Then I am navigated to the Reports Dashboard Page (/projects/{id}/reports) for that project.

Story: PD-3.5: Archive a Project

Story: As a Project Manager, I want to archive a project so that it is hidden from all users.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am a Project Manager or Admin

And I am the creator of a project

And the project has 0 reports

Then the "Archive" button in the project row is enabled.

Given the project has 1 or more reports, or I am not the creator

Then the "Archive" button is disabled.

When I click the enabled "Archive" button

Then a confirmation modal appears (Title: "Are you sure?", Message: "Are you sure you want to archive this project? Invited users will no longer see it.", Buttons: "Cancel" (Secondary), "Archive" (Destructive)).

When I click "Archive"

Then a loading indicator is shown.

And the project row is hidden from the list.

And a success toast is shown: "Project archived."

Story: PD-3.6: Bulk Archive Projects

Story: As a Project Manager, I want to archive multiple projects at once.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am a Project Manager or Admin

Then checkboxes are only enabled for projects I created and that have 0 reports.

When I check at least one enabled checkbox

Then an "Archive Selected" (Destructive) button appears above the list.

When I click "Archive Selected"

Then the standard "Archive" confirmation modal appears.

When I confirm

Then a loading indicator is shown.

And all selected (and valid) projects are hidden.

And a success toast is shown.

Story: PD-3.7: View and Unarchive Projects

Story: As a Project Manager, I want to view archived projects and unarchive them.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am on the Projects Dashboard

When I click the "Show Archived" (Ghost) button

Then the button becomes active and the list updates to show only archived projects.

And the table now has an "Unarchive" button.

When I click "Unarchive" on a row

Then a confirmation modal appears (Title: "Are you sure?", Message: "Are you sure you want to unarchive this project?", Buttons: "Cancel", "Unarchive" (Primary)).

When I confirm

Then the project is restored and disappears from the archived list.

And a success toast is shown.

When I click the "Show Archived" button again

Then it deactivates and the list shows active projects.

(Bulk unarchiving follows the same logic as bulk archiving)

Epic: 4.0 New Project Page (/projects/new)

Story: NP-4.1: Create New Project Shell

Story: As a Project Manager, I want to start creating a new project by filling in its details.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am on the New Project Page

Then I see a text input for "Project Title".

And I see a navigation bar with tabs: "Report Template", "Knowledge Base", "Competency Dictionary", "Simulation Methods", "Prompt Settings", "Users List".

And I see a "Create Project" (Primary) button and a "Cancel" (Secondary) button.

And the "Create Project" button is disabled by default.

Story: NP-4.2: Upload Report Template

Story: As a Project Manager, I want to upload a .docx report template and validate its placeholders.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am on the "Report Template" tab

Then I see a file uploader (drag-and-drop or click) that accepts .docx files only.

When I upload a valid .docx file

Then a loading indicator is shown.

And the system reads the file and displays a list of all found placeholder fields (e.g., {overall_strength}, {[competency_name]_level}).

Given the file contains duplicate placeholder fields

Then a warning message is shown: "There are duplicate placeholder fields in the file: 

$$list of duplicates$$

. Please check again."

Story: NP-4.3: Upload Project Knowledge Base

Story: As a Project Manager, I want to upload files to the project-specific Knowledge Base (RAG).

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am on the "Knowledge Base" tab

Then I see a file uploader that accepts .pdf, .docx, .txt files.

When I upload one or more files

Then a progress bar is shown for each file, indicating chunking and embedding status.

And upon completion, the files are added to a list of "Uploaded Files".

And this data is added to the RAG layer for this specific project.

Story: NP-4.4: Select Competency Dictionary

Story: As a Project Manager, I want to select a Competency Dictionary for this project.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am on the "Competency Dictionary" tab

Then I see a searchable dropdown list of all available dictionaries (managed by Admin).

When I select a dictionary

Then a read-only view of that dictionary (Name, Table of Competencies, Definitions, Levels, Level Descriptions, KBs) is displayed below the dropdown.

Story: NP-4.5: Configure Simulation Methods

Story: As a Project Manager, I want to select existing simulation methods or upload new ones for this project.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am on the "Simulation Methods" tab

Then I see a multi-select (checkbox) dropdown with a search bar, listing all global simulation methods (managed by Admin).

And I see a separate file uploader (drag-and-drop) to add project-specific simulation method data (.pdf, .docx, .txt).

When I upload a project-specific file

Then a progress bar is shown (chunking/embedding).

And I am prompted to select a "Simulation Method" (e.g., 'Case Study', 'Roleplay') from a dropdown to tag this file with.

And I can add a new simulation method tag via an "Add New Simulation Method" button, which opens a modal to enter the new method's name.

And all selected and uploaded methods appear in a list.

Story: NP-4.6: Configure Prompts

Story: As a Project Manager, I want to customize the AI prompts for this project or use the admin defaults.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am on the "Prompt Settings" tab

Then I see editable text areas for: "General context of the project", "Persona (System Prompt)", "Evidence Collection (KB_evidence_prompt)", "Competency Analysis (competency_analysis_prompt)", "Executive Summary (executive_summary_prompt)".

And all text areas (except "General context") are pre-filled with the Admin-defined defaults.

And I see toggles to enable/disable the "Competency Analysis" and "Executive Summary" generation phases.

And the toggles are linked (e.g., I cannot enable Summary without Analysis).

Story: NP-4.7: Invite Users

Story: As a Project Manager, I want to invite users to this project so they can create reports.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am on the "Users List" tab

Then I see a searchable multi-select dropdown listing all users in the system.

When I select users

Then they are added to a list of "Invited Users".

Story: NP-4.8: Create Project

Story: As a Project Manager, I want to save the new project after filling in all required information.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am on the New Project Page

And all required sections are filled (Project Title, Report Template, Competency Dictionary, at least one Simulation Method, at least one User).

Then the "Create Project" (Primary) button is enabled.

When I click "Create Project"

Then a loading indicator is shown and the button is disabled.

And the project is saved.

And I am redirected to the Reports Dashboard Page (/projects/{new_id}/reports) for the newly created project.

Given I click the "Cancel" (Secondary) button

Then the 

$$GBL-2.6 Unsaved Changes Modal$$

 is displayed.

Epic: 5.0 Reports Dashboard (/projects/{id}/reports)

Story: RD-5.1: View Reports Dashboard

Story: As a User, I want to see a dashboard for a specific project so that I can manage its reports.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I have navigated to a project's Reports Dashboard

Then I see the specific "Project Title" at the top of the page.

And I see a "+ New Report" (Primary) button in the top right.

And I see a "Project Context" (Ghost) button next to the title.

And I see a search bar and a "Show Archived" (Ghost) button.

Story: RD-5.2: View Project Context

Story: As a User, I want to view the project's context so I can understand its setup.

Roles: User, Project Manager, Admin

Acceptance Criteria:

When I click the "Project Context" button

Then a modal (Project Context Modal) appears.

And the modal displays:

Project Manager Name

A link to download the .docx Report Template

A list of project Knowledge Base files (with download links)

A card for the "Competency Dictionary Title"

List of simulation methods used (display the specific title and the simulation method tag)

General Context text

When I click the "Competency Dictionary Title" card

Then a new modal appears over the current one, showing the full dictionary (Name, Table of Competencies, Definitions, Levels, KBs).

When I click the 'X' button or outside the modal

Then the modal closes.

Story: RD-5.3: View Report List (User)

Story: As a User, I want to see a list of reports I have created for this project.

Roles: User

Acceptance Criteria:

Given I am a User on the Reports Dashboard

When the page loads

Then a loading state is shown.

And a table lists all reports created by me with columns: "Date" (creation), "Title", "Archive" (button), Checkbox.

Story: RD-5.4: View Report List (Project Manager / Admin)

Story: As a Project Manager, I want to see all reports created for projects I manage, and my reports for projects I'm invited to.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am a Project Manager or Admin

And I created this project

Then the report table lists all reports from all users, with columns: "Date", "Title", "User" (creator), "Archive" (button), Checkbox.

Given I am a Project Manager or Admin

And I am invited to this project (but did not create it)

Then the report table lists only reports created by me, with columns: "Date", "Title", "Archive" (button), Checkbox.

And the "Archive" button and Checkbox are only enabled for reports I created.

Story: RD-5.5: Interact with Report List

Story: As a User, I want to filter, archive, and navigate my report list.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Scenario 1: Filter List

When I type "Candidate" into the search bar

Then the list filters to only show reports with "Candidate" in the title.

Scenario 2: Navigate to Report

When I click on a report row

Then I am navigated to the Report Page (/reports/{id}) for that report.

Scenario 3: Archive / Unarchive

(This follows the exact same logic as 

$$PD-3.5$$

, 

$$PD-3.6$$

, and 

$$PD-3.7$$

, but applied to reports. The "Archive" button and checkbox are only enabled for a user's own reports.)

Scenario 4: Navigate to New Report

When I click the "+ New Report" button

Then I am navigated to the New Report Page (/projects/{id}/reports/new).

Epic: 6.0 New Report Page (/projects/{id}/reports/new)

Story: NR-6.1: Create New Report

Story: As a User, I want to create a new report by providing a title, assessment files, and context.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I am on the New Report Page

Then I see a "Report Title" text input.

And I see a file uploader for "Assessment Results" files.

And I see inputs for "Target Competency Levels".

And I see a text area for "Additional specific context".

And I see a "Generate Report" (Primary) button, which is disabled.

Story: NR-6.2: Upload Assessment Results

Story: As a User, I want to upload assessment files and tag them with a simulation method.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I am on the New Report Page

When I upload one or more assessment result files

Then a progress bar is shown for each file (indicating chunking/embedding).

And for each uploaded file, I am prompted to select a "Simulation Method" from a dropdown (list defined in the Project settings).

And this data is added to the RAG layer for this specific report.

Story: NR-6.3: Set Target Levels

Story: As a User, I want to set the target competency levels for the report.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given the Project's Competency Dictionary is loaded

Then I see a "Global Target Level" dropdown.

When I select a global level (e.g., "3")

Then all individual competency target level dropdowns are set to "3".

And I can then override the target level for specific competencies individually.

Story: NR-6.4: Generate Report

Story: As a User, I want to start the AI generation once all required information is provided.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I have entered a "Report Title"

And I have uploaded at least one assessment file

And all uploaded files have been processed (progress bars are 100%)

And all uploaded files have an-assigned simulation method tag

Then the "Generate Report" (Primary) button is enabled.

When I click "Generate Report"

Then a loading indicator is shown.

And the report entity is created and the background generation task (bullmq) is queued.

And I am redirected to the Report Page (/reports/{new_id}).

Epic: 7.0 Report Page (/reports/{id})

Story: RP-7.1: View Report Page Layout

Story: As a User, I want to view the report generation interface.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I navigate to a Report Page

Then I see the "Report Title" at the top.

And I see a "View Context" (Ghost) button next to the title.

And I see a "Save Report" (Primary) button and an "Export" (Secondary) button in the top right.

And I see a two-panel layout: "Raw Assessment Results" on the left and "Analysis Content" on the right.

And I can click and drag the border between the two panels to resize them.

And I can click icons to hide/show either panel.

Story: RP-7.2: View Report Context

Story: As a User, I want to review the context I provided for this specific report.

Roles: User, Project Manager, Admin

Acceptance Criteria:

When I click the "View Context" button

Then a slide-out panel ("Report Context Modal") appears.

And the panel shows: Report Title, Uploaded Files (with their tagged Simulation Method), and the "Additional specific context" text.

And the panel contains a "View Project Context" button which, when clicked, opens the 

$$RD-5.2 Project Context Modal$$

.

Story: RP-7.3: View Raw Assessment Results

Story: As a User, I want to see the raw text of my-uploaded files so I can reference them.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I am on the Report Page

Then the "Raw Assessment Results" panel contains sub-tabs for each file I uploaded.

And each sub-tab is named after the "Simulation Method" I tagged it with.

When I click a sub-tab

Then the content of that file is displayed as raw text with line numbers.

Story: RP-7.4: Phase 1 - AI Generates Evidence

Story: As a User, I want the AI to automatically read the results and generate evidence cards.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I have just arrived from the New Report Page

Then the "Analysis Content" panel shows the "Evidence Collection" sub-tab.

And a loading indicator (e.g., "AI is generating evidence...") is displayed.

And evidence cards begin to pop up one-by-one as they are generated by the AI (via KB_evidence_prompt).

And cards are sorted by Competency, Level, and KB number.

When all evidence generation is complete

Then the loading indicator is replaced by a "Generate Next Section" (Primary) button and an "Export" (Secondary) button.

Story: RP-7.5: Phase 1 - View Evidence Card

Story: As a User, I want to see the details of each evidence card.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given an evidence card is displayed

Then it shows: "Competency Name", "Level", "Key behavior" (primary text), "Evidence quote", "Source" (Simulation Method), "See Reasoning" (button), "Change Evidence" (button), "Delete Evidence" (button).

When I click the "See Reasoning" button

Then the card content flips to show the AI's reasoning.

And the button text changes to "See Evidence".

When I click the card

Then the "Raw Assessment Results" panel automatically navigates to the correct sub-tab (Source) and scrolls to the corresponding line number.

And the text in the raw results is highlighted.

And the evidence card is also highlighted with a matching color.

Story: RP-7.6: Phase 1 - Filter Evidence Cards

Story: As a User, I want to filter the evidence cards so I can focus on one competency, level, and/or source at a time.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I am on the "Evidence Collection" sub-tab

Then I see three filter dropdowns at the top: one for "Competency Name", one for "Level", one for “Source”.

When I select "Problem Solving" from the competency filter

Then the list updates to show only evidence cards for "Problem Solving".

Story: RP-7.7: Phase 1 - Manually Create Evidence

Story: As a User, I want to create my own evidence card if the AI missed something.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I am on the "Evidence Collection" sub-tab (and "Generate Next Section" has not been clicked)

When I click the "+ Create Evidence" button

Then a slide-out panel appears.

And the panel has dropdowns for "Competency", "Level", "Key Behavior", and a text area for "Reasoning".

And the "Raw Assessment Results" panel border is emphasized, prompting me to highlight text.

And the slide-out panel has a "Create" (Primary) button, which is disabled.

When I highlight text in the raw results

And I select a Competency, Level, and KB

And I type a reasoning (optional)

Then the "Create" button is enabled.

When I click "Create"

Then a new evidence card is created and added to the list.

Story: RP-7.8: Phase 1 - Change Evidence

Story: As a User, I want to change an AI-generated evidence card.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I am on the "Evidence Collection" sub-tab

When I click "Change Evidence" on a card

Then a slide-out panel appears, pre-filled with the card's data (Competency, Level, KB, Reasoning), all of which are editable.

And the "Raw Assessment Results" panel border is emphasized.

And the panel has a "Change" (Primary) button, which is disabled.

When I highlight new text in the raw results

Then the "Change" button is enabled.

When I click "Change"

Then a confirmation modal appears (Title: "Are you sure?", Message: "Are you sure you want to change this evidence?", Buttons: "Cancel", "Change" (Primary)).

When I confirm

Then the evidence card is updated with the new quote and/or data.

Story: RP-7.9: Phase 1 - Delete Evidence

Story: As a User, I want to delete an AI-generated evidence card.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I am on the "Evidence Collection" sub-tab

When I click "Delete Evidence" on a card

Then a confirmation modal appears (Title: "Are you sure?", Message: "Are you sure you want to delete this evidence?", Buttons: "Cancel", "Delete" (Destructive)).

When I click "Delete"

Then the evidence card is removed from the list.

Story: RP-7.10: Phase 1 - Export Evidence

Story: As a User, I want to export the evidence list as an Excel file.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given the "Export" button is visible on the "Evidence Collection" sub-tab

When I click it

Then a .xlsx file is downloaded.

And the file contains columns: "Competency", "Level", "Key Behavior", "Source", "Evidence", "Reasoning".

Story: RP-7.11: Phase 2 - Generate Competency Analysis

Story: As a User, I want to generate the next section, "Competency Analysis," based on the collected evidence.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I am on the "Evidence Collection" sub-tab

When I click the "Generate Next Section" button

Then the button shows a loading spinner.

And all controls on the "Evidence Collection" tab are disabled (e.g., Create, Change, Delete) except for “See Reasoning”.

And the "Generate Next Section" button is removed.

And a new sub-tab "Competency Analysis" appears and is selected.

And a loading indicator is shown in the new tab.

And Competency Analysis cards begin to pop up one-by-one as they are generated (via competency_analysis_prompt).

When generation is complete

Then the loading indicator is replaced by a "Generate Next Section" button (if the Executive Summary phase is enabled in project settings).

Story: RP-7.12: Phase 2 - View Competency Analysis

Story: As a User, I want to review the detailed competency analysis and AI's reasoning.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given a "Competency Analysis" card is displayed

Then it shows:

"Competency Name"

A numeric stepper for "Level Achieved" (pre-filled by AI).

The "Target Level" is displayed next to it.

The "Level Achieved" number is color-coded: green if > target, yellow if < target, black if = target.

An editable text area for "Explanation for the competency".

A "Levels explained list" showing KBs for the target level, one level above, and one level below (or as per the AI logic).

Each KB in the list has:

Key behavior text

A Checkbox (Fulfilled/Not Fulfilled, checked by AI)

An editable "Explanation" text area (why it was fulfilled/not)

A list of the evidence (quote and source) used for this decision.

An editable text area for "Development Recommendations".

Story: RP-7.13: Phase 2 & 3 - Edit and Refine with AI

Story: As a User, I want to manually edit content or use an AI assistant to refine it.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I am viewing an editable field (e.g., "Explanation for the competency")

Then I can type directly into the text area to edit it.

When I hover over an editable component

Then an "AI" button (magic/sparkle icon) appears.

When I click the "AI" button

Then a slide-out panel ("Ask AI") appears with a textbox.

When I type a request (e.g., "Make this more concise") and click "Refine"

Then a loading indicator is shown.

And the AI processes the request and updates the content of the component.

And the panel expands to show the AI's reasoning for the edit.

And an "Undo" button appears in the panel to revert the change.

Given I have exceeded the token limit for this component (set by Admin)

Then the "Refine" button is disabled and a message is shown: "You have reached the token limit for this component."

Story: RP-7.14: Phase 3 - Generate Executive Summary

Story: As a User, I want to generate the final "Executive Summary" section.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I am on the "Competency Analysis" sub-tab

When I click "Generate Next Section"

Then the button shows a loading spinner.

And all controls on the "Competency Analysis" tab are disabled (e.g., editing, AI refine).

And the "Generate Next Section" button is removed.

And a new sub-tab "Executive Summary" appears and is selected.

And the AI generates content (via executive_summary_prompt) for:

"Strengths" (editable markdown text area)

"Areas for Improvement" (editable markdown text area)

"Development Recommendations" (editable markdown text area)

And each section has its own "Ask AI" refine button 

$$RP-7.13$$

.

When generation is complete

Then the "Export" button in the page header is enabled.

Story: RP-7.15: Global - Save Report

Story: As a User, I want to save my report progress so I can return to it later.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given I am on the Report Page

When I click the "Save Report" (Primary) button

Then the button shows a loading spinner and is disabled.

And all generated content and manual edits are saved to the database.

When saving is complete

Then the button returns to normal.

And a success toast appears: "Report saved successfully."

Given I try to leave the page with unsaved changes

Then the 

$$GBL-2.6 Unsaved Changes Modal$$

 is displayed.

Given an AI generation is in progress

Then I can still save and leave the page, and the generation will continue in the background.

Story: RP-7.16: Global - Export Report

Story: As a User, I want to export the final report as a .docx file using the project's template.

Roles: User, Project Manager, Admin

Acceptance Criteria:

Given all enabled generation phases are complete

Then the "Export" (Secondary) button in the page header is enabled.

When I click the "Export" button

Then a loading indicator is shown.

And the system fetches the project's .docx template.

And all tagged fields (e.g., {overall_strength}, {[competency_name]_level}) are replaced with the content from the report.

And a .docx file is downloaded.

And the file is named in the format: DD-MM-YY - [Report Title].docx.

Story: RP-7.17: View-Only Mode

Story: As a Project Manager, I want to view reports created by other users in a read-only mode.

Roles: Project Manager, Admin

Acceptance Criteria:

Given I am a Project Manager or Admin

And I am the creator of the project

When I open a report created by another user

Then I am navigated to the Report Page.

And all editing functionality is disabled:

All text fields and numeric steppers are read-only.

"Create Evidence", "Change Evidence", "Delete Evidence" buttons are hidden/disabled.

"Ask AI" buttons are hidden/disabled.

"Generate Next Section" buttons are hidden/disabled (if generation is not complete, I can only view progress).

"Save Report" button is hidden.

And I can still use the "View Context", "Export", and "Raw Assessment Results" tabs.

Epic: 8.0 Admin Panel (/admin/*)

Story: ADM-8.1: Navigate Admin Panel

Story: As an Admin, I want to navigate the different sections of the Admin Panel.

Roles: Admin

Acceptance Criteria:

Given I am on the Admin Panel Page

Then I see a tabbed navigation for: "Usage Dashboard", "Queue Dashboard", "Comprehensive Logging", "Knowledge Base", "AI Settings", "User Management".

When I click a tab

Then I am shown the content for that section.

Story: ADM-8.2: View Usage Dashboard

Story: As an Admin, I want to see a dashboard of app usage statistics so I can monitor costs and performance.

Roles: Admin

Acceptance Criteria:

Given I am on the "Usage Dashboard" tab

Then I see a date range filter (with shortcuts: Today, Yesterday, This Week, Last Week, This Month, Last Month, All).

And I see a multi-select dropdown filter for "AI Model Used".

And I see charts and stats for the selected filters:

Line chart: "Number of AI API requests"

Bar chart: "Number of tokens (input, thinking, output)"

Big number: "Error Rate (%)"

Chart: "Wait time per section (per model)"

Big number: "Total Estimated Cost" (e.g., "$123.45")

When I change a filter

Then all charts and stats update.

Story: ADM-8.3: View Queue Dashboard

Story: As an Admin, I want to see the status of background jobs so I can monitor system health.

Roles: Admin

Acceptance Criteria:

Given I am on the "Queue Dashboard" tab

Then I see the BullMQ Bull-board UI.

And I can see all active, waiting, completed, and failed jobs.

Story: ADM-8.4: View Comprehensive Logs

Story: As an Admin, I want to see a detailed log of all AI API requests for auditing and debugging.

Roles: Admin

Acceptance Criteria:

Given I am on the "Comprehensive Logging" tab

Then I see a sortable table of all AI requests with columns: "Timestamp", "User", "Report ID", "Model Used", "Input and Output Tokens".

Acceptance Criteria (Modal):

When I click a row

Then a modal appears showing detailed info:

All info from the table row.

An "AI interactions table" listing all generations and "Ask AI" refinements for that specific component.

Table columns: "Prompt text", "Input tokens", "Output text", "Output tokens", "Edited text" (manual user edits, "-" if none).

Acceptance Criteria (Export):

When I click the "Export" button

Then a modal appears with a date range filter and a dropdown to select format (CSV/JSON).

When I click "Export" in the modal

Then the log file in the selected format and date range is downloaded.

Story: ADM-8.5: Manage Global Knowledge Base

Story: As an Admin, I want to manage the global knowledge base (RAG) that applies to all projects.

Roles: Admin

Acceptance Criteria:

Given I am on the "Knowledge Base" tab

Then I see a file uploader (.pdf, .docx, .txt) for the global RAG layer.

When I upload a file

Then a progress bar is shown (chunking/embedding).

And the file appears in a list below (Timestamp, File Name, "Download" button).

When I click "Download"

Then I can re-download the original file.

Story: ADM-8.6: Manage Competency Dictionaries

Story: As an Admin, I want to upload and manage Competency Dictionaries for project managers to use.

Roles: Admin

Acceptance Criteria:

Given I am on the "Knowledge Base" tab, in the "Competency Dictionary" section

Then I see a file uploader that accepts .json files.

And I see a searchable list of all uploaded dictionaries (Date, Name, "Delete" button).

When I click the "Delete" (Destructive) button

Then the standard "Delete" confirmation modal appears.

When I click a dictionary row

Then a modal appears showing the full dictionary (Name, Table of Competencies, etc.).

And all fields in this modal are editable.

When I edit a field and click "Save"

Then the changes are saved and the modal closes.

When I click "Cancel" or click outside the modal

Then the 

$$GBL-2.6 Unsaved Changes Modal$$

 is displayed.

Story: ADM-8.7: Manage Simulation Methods

Story: As an Admin, I want to manage the global simulation method data and tags.

Roles: Admin

Acceptance Criteria:

Given I am on the "Knowledge Base" tab, in the "Simulation Methods" section

Then I see a file uploader (.pdf, .docx, .txt) for global simulation data.

When I upload a file

Then a progress bar is shown (chunking/embedding).

And I am prompted to select a "Simulation Method" tag from a searchable dropdown (defaults: 'Case Study', 'Roleplay', etc.).

When I click "Add New Simulation Method"

Then a modal appears to enter a new method name, which is then added to the global list.

And the uploaded file appears in a list (Timestamp, File Name, "Download" button).

Story: ADM-8.8: Configure AI Settings

Story: As an Admin, I want to configure the AI models and default prompts for the entire application.

Roles: Admin

Acceptance Criteria:

Given I am on the "AI Settings" tab

Then I see:

A dropdown to select the "Main LLM" (from OpenRouter).

A dropdown to select the "Backup LLM".

Number sliders for "Main LLM Temperature" and "Backup LLM Temperature" (disabled if model doesn't support it).

A toggle to enable/disable the "Ask AI" refinement feature.

A dropdown to select the "Ask AI" LLM model.

A number slider for “Ask AI” LLM Temperature.

A text area to set the "Ask AI" system prompt.

Story: ADM-8.9: Configure Default Prompts

Story: As an Admin, I want to set and version-control the default prompts for all projects.

Roles: Admin

Acceptance Criteria:

Given I am on the "AI Settings" tab

Then I see editable text areas for default prompts: "Persona (System Prompt)", "Evidence Collection", "Competency Analysis", "Executive Summary".

And each text area has a "Save" button and a "View Version History" button.

When I click "View Version History"

Then a modal appears listing past versions (Timestamp, User who edited).

And each version has a "Restore" button.

When I click "Restore"

Then the text area content is replaced with that version's text.

Story: ADM-8.10: Manage Users

Story: As an Admin, I want to create, edit, and delete user accounts.

Roles: Admin

Acceptance Criteria:

Given I am on the "User Management" tab

Then I see a list of all users (User Name, User Role, "Delete" button).

And I see an "Add User" (Primary) button.

Acceptance Criteria (Add User):

When I click "Add User"

Then a modal appears with fields for: "User name", "User e-mail", "User password", "User role" (dropdown: 'admin', 'project manager', 'user').

When I fill the form and click "Add User"

Then a loading indicator is shown.

And the user is created and added to the list.

And the modal closes.

Acceptance Criteria (Edit User):

When I click a user row

Then a modal appears, pre-filled with: "Date created", "User name", "User e-mail", "User password" (hidden/masked), "User role" (dropdown).

When I change the "User role" and click "Save"

Then the user's role is updated.

Acceptance Criteria (Delete User):

When I click the "Delete" (Destructive) button on a row

Then a confirmation modal appears (Title: "Are you sure?", Message: "Are you sure you want to delete this user?", Buttons: "Cancel", "Delete").

When I confirm

Then the user is deleted from the list.