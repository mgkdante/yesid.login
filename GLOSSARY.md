# yesid.login

The hosted sign-in and editing service behind `login.yesid.dev`. It lets the people of each Client edit their Site's content, and nothing else.

## Service

**Login**:
The hosted service at `login.yesid.dev`. It covers sign-in, the Editor, saving content to GitHub and People. It never builds, publishes or hosts a Site.
_Avoid_: plugin, login package, Login Site

**Operator**:
yesid.dev, which runs Login and every Site's repository. The Operator is not a Role.
_Avoid_: admin, super-user

**Editor**:
The content editor a Member opens for one Site in Login.
_Avoid_: CMS, admin

## Sites and people

**Client**:
The person or organization a Site is made for, paid or not. A friend is a Client.
_Avoid_: friend, customer, tenant

**Site**:
One Client website, known to Login by its slug, with exactly one repository and branch.
_Avoid_: project, tenant, app

**Sandbox Site**:
A Site that holds only test content, owned by the Operator, used to check Login after a release.
_Avoid_: test client, demo site

**Retired slug**:
The slug of a Site that has left Login. It is never given to another Site.

**Offboarding**:
A Client leaving Login: their repository goes back to them or is archived, and their Site is removed.
_Avoid_: deletion, churn

**Member**:
A person who holds a Role on a Site.
_Avoid_: user, account, editor

**Role**:
What a Member is on a Site: Owner, IT or Employee. Every Role may edit content.

**Owner**:
The Client's lead person on a Site.

**IT**:
The Member who looks after a Site technically for the Client.

**Employee**:
A Member invited by an Owner or IT, whose access starts as a pending invitation.

**People**:
The part of Login where an Owner or IT manages a Site's Employees.

## Content

**Content file**:
A file in a Site's repository that Login lets Members read and change. One set of rules defines Content files for every Site.
_Avoid_: content path, allowed file
