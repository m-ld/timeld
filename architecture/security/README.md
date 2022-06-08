# security

## headlines

- Using email for account identity verification
- Devices (clients) are issued Ably keys
- Ably keys are maintained with the correct authorisations ("capabilities") to control user access to timesheet channels
- Account administration is remote (account details not synced to client)

## use-cases

![use-cases](img/accounts.use-case.svg)

## classes

Write access to timesheets is determined as follows (see Z-notation in diagram). The user has access to a timesheet IF and ONLY IF:
- the user's account owns the timesheet; OR
- the user's account is directly a 'provider' in a project with the timesheet; OR
- the user is a member of a organisation that is a 'provider' in a project with the timesheet.

In consequence, ALL members of an organisation which is a provider to a project have access to the project's timesheets. If more fine-grained control is needed, individual users can be added to the project as providers.

Projects and timesheets exist in a many-to-many mapping, which can only be set by the timesheet owner (the user account owner or an admin of an organisation account). This supports the following stories:

1. As an organisation admin, I can add timesheets belonging to my organisation to projects belonging to my organisation, so I can set up a project autonomously.
2. As an independent user, I can add one of my timesheets to a project belonging to some organisation (accepting that the project provider will therefore have access to my timesheet); so I can make my contributions visible.

In the diagram, some classes are in common with the [data model](../data-model); only security-relevant properties are shown here.

![classes](img/accounts.class.svg)

## process

![process](img/register-cli.seq.svg)
