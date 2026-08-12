# HR Controller Dashboard — Product & Requirements Document

## 1. Objective

Build a centralized HR Controller Dashboard for an IT company that allows the HR team to manage the complete employee lifecycle from a single application.

The system should cover:

**Candidate → Interview → Selection → Offer → Onboarding → Employee → Attendance → Leave → Payroll → Performance → Promotion → Exit → Offboarding**

The dashboard should also provide management-level analytics and integrate with external services such as **Keka** for HR/payroll-related workflows.

---

# 2. HR Dashboard

The main dashboard should provide HR with a real-time overview of the organization.

### Dashboard metrics

* Total employees
* Active employees
* New employees
* Employees on leave
* Employees absent today
* Employees working remotely
* Open positions
* Candidates in interview
* Offers pending
* Employees joining this month
* Employees leaving this month
* Upcoming birthdays
* Upcoming work anniversaries
* Pending HR approvals
* Pending leave approvals
* Pending expense approvals
* Payroll status
* Attendance anomalies

### Department overview

Display:

* Engineering
* Product
* Design
* Marketing
* Sales
* HR
* Finance
* Operations
* Other departments

For each department:

* Employee count
* Open positions
* Average tenure
* Attendance
* Leave utilization
* Performance distribution

---

# 3. Employee Management

HR should be able to manage the complete employee profile.

## Employee profile

### Personal information

* Full name
* Profile photo
* Date of birth
* Gender
* Personal email
* Phone number
* Address
* Emergency contact

### Employment information

* Employee ID
* Joining date
* Department
* Designation
* Manager
* Employment type
* Work location
* Work mode
* Employment status
* Probation status

### Compensation

* Salary
* Salary structure
* CTC
* Variable compensation
* Bonus
* Effective date

Sensitive compensation information must have strict RBAC permissions.

### Documents

* Resume
* Offer letter
* Employment agreement
* ID documents
* Tax documents
* Bank documents
* Certificates
* NDA
* Other HR documents

Documents should support:

* Upload
* Download
* Versioning
* Expiry tracking
* Access control

---

# 4. Organization Management

HR should be able to manage the organizational structure.

## Departments

CRUD operations for:

* Department
* Department head
* Employees
* Budget
* Cost center

## Designations

Manage:

* Job title
* Job level
* Career level
* Department
* Salary band
* Reporting structure

Example:

```text
Engineering
 ├── Engineering Manager
 │
 ├── Senior Software Engineer
 │
 ├── Software Engineer
 │
 └── Junior Software Engineer
```

---

# 5. Organizational Chart

Provide a visual company hierarchy.

Example:

```text
CEO
 |
 ├── CTO
 |    |
 |    ├── Engineering Manager
 |    |      ├── Senior Engineer
 |    |      └── Engineer
 |    |
 |    └── Product Manager
 |
 ├── CFO
 |
 └── HR Head
      |
      ├── HR Manager
      └── Recruiter
```

Users should be able to click an employee and open their profile.

---

# 6. Recruitment / ATS

HR should be able to manage recruitment from the same application.

## Job openings

Create:

* Job title
* Department
* Location
* Employment type
* Salary range
* Experience
* Skills
* Job description
* Hiring manager
* Number of openings

## Candidate pipeline

Example:

```text
Applied
   ↓
Screening
   ↓
Shortlisted
   ↓
Interview
   ↓
Technical Interview
   ↓
HR Interview
   ↓
Selected
   ↓
Offer
   ↓
Hired
```

---

# 7. Candidate Management

Candidate profile should contain:

* Name
* Email
* Phone
* Resume
* LinkedIn
* Portfolio
* Experience
* Skills
* Current company
* Expected salary
* Notice period
* Source

HR should be able to track the entire candidate history.

---

# 8. Interview Management

HR should be able to schedule interviews.

### Interview information

* Candidate
* Interviewer
* Interview type
* Date
* Time
* Meeting URL
* Interview round
* Interview status

### Interview rounds

Example:

```text
HR Screening
      ↓
Technical Round 1
      ↓
Technical Round 2
      ↓
Managerial Round
      ↓
HR Final Round
```

Interviewers should be able to submit feedback.

### Feedback

* Technical score
* Communication
* Problem solving
* Culture fit
* Recommendation
* Comments

---

# 9. Offer Management

HR can create and manage offers.

Offer should contain:

* Candidate
* Position
* Joining date
* Salary
* CTC
* Benefits
* Probation
* Notice period
* Offer expiry

Status:

```text
Draft
Sent
Viewed
Accepted
Rejected
Expired
```

---

# 10. Onboarding

Once a candidate accepts an offer, automatically create an onboarding workflow.

### Onboarding checklist

* Employee account
* Email account
* Laptop
* Software access
* GitHub access
* Slack access
* VPN
* HR documents
* Bank details
* Tax information
* NDA
* Orientation
* Manager assignment

Each task should have:

* Owner
* Due date
* Status
* Completion timestamp

---

# 11. Employee Self-Service

Employees should have their own portal.

They should be able to:

* View profile
* Update allowed personal information
* Apply for leave
* View attendance
* View payslips
* Download documents
* Submit expenses
* View performance
* View goals
* Request HR changes
* Raise HR tickets

---

# 12. Attendance Management

Track:

* Check-in
* Check-out
* Working hours
* Late arrival
* Early departure
* Overtime
* Absence
* Work from home

### Attendance states

```text
Present
Absent
Half Day
Late
Work From Home
Holiday
Leave
```

HR should have monthly attendance reports.

---

# 13. Leave Management

Configure:

* Annual leave
* Sick leave
* Casual leave
* Paid leave
* Unpaid leave
* Maternity/paternity leave
* Company-specific leave types

Employee flow:

```text
Employee
   ↓
Leave Request
   ↓
Manager Approval
   ↓
HR / Final Approval
   ↓
Leave Balance Updated
```

---

# 14. Holiday Management

HR should manage:

* Company holidays
* Public holidays
* Department-specific holidays
* Regional holidays

Calendar view should show:

* Holidays
* Leaves
* Weekends

---

# 15. Payroll

Payroll should ideally integrate with **Keka** rather than duplicating an existing payroll engine.

The application should be able to synchronize:

* Employee information
* Attendance
* Leave
* Payroll status
* Payslips
* Salary information where permitted

Payroll data must have highly restricted permissions.

---

# 16. Keka Integration

Keka integration should be designed as a dedicated integration layer.

```text
HR Controller
      |
      ↓
Integration Service
      |
      ↓
Keka API
```

The integration should support, subject to Keka API availability and your account permissions:

* Employee synchronization
* Department synchronization
* Attendance synchronization
* Leave synchronization
* Payroll information
* Payslip information
* Employee status

Do not tightly couple the application directly to Keka APIs.

Instead use:

```text
KekaAdapter
```

This makes it possible to replace Keka later.

---

# 17. Performance Management

HR should manage employee performance.

## Goals

Employee goals:

* Goal
* Description
* KPI
* Target
* Deadline
* Weight
* Progress

Example:

```text
Goal: Improve API performance

Target: Reduce API latency by 30%

Weight: 20%

Deadline: Q3

Progress: 70%
```

---

# 18. Performance Reviews

Review cycles:

```text
Quarterly
Half-Yearly
Yearly
```

Review can contain:

* Self review
* Manager review
* Peer review
* HR review

Metrics:

* Performance score
* Goal completion
* Technical skills
* Leadership
* Communication
* Collaboration

---

# 19. Promotion Management

HR should manage promotion requests.

Flow:

```text
Manager
   ↓
Promotion Request
   ↓
HR Review
   ↓
Management Approval
   ↓
Salary Revision
   ↓
Promotion Effective
```

Store complete history.

---

# 20. Compensation Management

Manage:

* Salary revisions
* Promotions
* Bonuses
* Incentives
* Salary bands
* Compensation history

Every compensation change should have:

* Old value
* New value
* Effective date
* Reason
* Approver
* Audit log

---

# 21. Expense Management

Employees should be able to submit expenses.

Example:

```text
Employee
   ↓
Expense
   ↓
Manager
   ↓
Finance
   ↓
Approved
   ↓
Paid
```

Support:

* Expense category
* Amount
* Receipt
* Date
* Description
* Approval status

---

# 22. HR Helpdesk

Create an internal HR ticketing system.

Categories:

* Payroll
* Attendance
* Leave
* Documents
* Benefits
* Employee information
* Policy
* IT access
* Other

Ticket status:

```text
Open
In Progress
Waiting
Resolved
Closed
```

---

# 23. Employee Documents

Create a centralized document management system.

Features:

* Upload
* Versioning
* Expiration date
* Document type
* Employee association
* Access permissions

Automatic reminders:

```text
Document expires in 30 days
Document expires in 7 days
Document expired
```

---

# 24. Exit Management

When an employee resigns:

```text
Resignation
     ↓
Manager Review
     ↓
HR Review
     ↓
Notice Period
     ↓
Exit Interview
     ↓
Asset Return
     ↓
Access Revocation
     ↓
Final Settlement
     ↓
Employee Offboarded
```

---

# 25. Offboarding Checklist

Track:

* Laptop returned
* ID card returned
* Access revoked
* GitHub access removed
* Email disabled
* Slack removed
* VPN removed
* Documents completed
* Exit interview
* Final settlement
* Experience letter
* Relieving letter

---

# 26. HR Analytics

Dashboard should provide:

### Workforce

* Headcount
* Hiring
* Attrition
* Turnover
* Department distribution

### Recruitment

* Applications
* Interviews
* Hiring rate
* Time to hire
* Time to fill
* Offer acceptance rate

### Attendance

* Attendance rate
* Absenteeism
* Late arrivals
* Overtime

### Leave

* Leave utilization
* Leave balance
* Department leave trends

### Performance

* Average performance score
* High performers
* Employees needing improvement
* Goal completion

### Attrition

* Monthly attrition
* Department attrition
* Voluntary vs involuntary
* Tenure-based attrition

---

# 27. Notifications

Central notification system should support:

* Email
* In-app notifications

Examples:

```text
Leave approved
Interview scheduled
Interview reminder
Offer accepted
Document expiring
Performance review due
Payroll processed
Approval pending
```

---

# 28. RBAC

This is one of the most important requirements.

Roles:

```text
Super Admin
HR Admin
HR Manager
Recruiter
Hiring Manager
Manager
Finance
Employee
```

Permissions should be granular.

Example:

```text
employee.read
employee.create
employee.update
employee.delete

salary.read
salary.update

payroll.read

leave.approve

candidate.read
candidate.create

performance.read
performance.manage
```

An employee should **never** automatically have access to all employee data.

---

# 29. Audit Logs

Every sensitive operation should be logged.

Example:

```json
{
  "user_id": "123",
  "action": "salary.updated",
  "employee_id": "456",
  "old_value": "...",
  "new_value": "...",
  "timestamp": "...",
  "ip": "...",
  "request_id": "..."
}
```

Audit logs should be immutable for normal users.

---

# 30. Authentication

Support:

* Email/password
* Google SSO
* Company SSO if required
* MFA for HR/Admin accounts

Session management should include:

* Access token
* Refresh token
* Session expiry
* Logout
* Device/session management

---

# 31. Backend Architecture

Recommended architecture:

```text
Frontend
   |
   ↓
API Gateway
   |
   ↓
Authentication
   |
   ↓
RBAC
   |
   ↓
Controllers
   |
   ↓
Services
   |
   ├── Employee Service
   ├── Recruitment Service
   ├── Interview Service
   ├── Attendance Service
   ├── Leave Service
   ├── Payroll Service
   ├── Performance Service
   ├── Document Service
   ├── Notification Service
   ├── Analytics Service
   └── Integration Service
            |
            └── Keka Adapter
   |
   ↓
Database
   |
   ├── PostgreSQL
   ├── Redis
   └── Object Storage
```

---

# 32. Database

Recommended primary database:

**PostgreSQL**

Core tables:

```text
users
employees
departments
designations
job_positions
candidates
applications
interviews
interview_feedback
offers
onboarding_tasks
attendance
leave_types
leave_requests
holidays
salary_history
payroll
performance_cycles
performance_reviews
goals
promotions
expenses
documents
tickets
notifications
audit_logs
integrations
integration_sync_logs
```

---

# 33. Redis

Redis should be used for:

* Background job queues
* Notification queues
* Caching
* Rate limiting
* Distributed locks
* Temporary sessions

Do not use Redis as the primary source of employee data.

---

# 34. Background Jobs

Use background workers for:

* Keka synchronization
* Email sending
* Notifications
* Report generation
* Document reminders
* Payroll synchronization
* Attendance synchronization
* Analytics aggregation

Example:

```text
Employee Updated
       ↓
Event
       ↓
Queue
       ↓
Worker
       ↓
Keka Sync
       ↓
Success / Retry
```

---

# 35. API Structure

Recommended API structure:

```text
/api/v1/auth

/api/v1/employees
/api/v1/departments
/api/v1/designations

/api/v1/recruitment
/api/v1/candidates
/api/v1/interviews
/api/v1/offers
/api/v1/onboarding

/api/v1/attendance
/api/v1/leaves
/api/v1/holidays

/api/v1/payroll
/api/v1/expenses

/api/v1/performance
/api/v1/goals
/api/v1/promotions

/api/v1/documents
/api/v1/hr-tickets

/api/v1/analytics
/api/v1/notifications

/api/v1/integrations/keka

/api/v1/audit-logs
```

---

# 36. Keka Synchronization Architecture

Never blindly overwrite local data.

Use:

```text
Keka
 ↓
Fetch
 ↓
Normalize
 ↓
Validate
 ↓
Compare
 ↓
Sync
 ↓
Local Database
```

Store synchronization metadata:

```text
last_synced_at
sync_status
external_id
sync_error
```

---

# 37. Data Security

HR systems contain extremely sensitive information.

Mandatory protections:

* Encryption in transit
* Encryption at rest
* Strong RBAC
* MFA for privileged users
* Sensitive-field access control
* Audit logging
* Rate limiting
* Input validation
* SQL injection protection
* Secure file uploads
* Virus/malware scanning
* Signed document URLs
* Secrets stored in environment/secret manager
* No salary/payroll data in frontend logs
* No sensitive information in application logs

---

# 38. File Storage

Do not store large documents directly inside PostgreSQL.

Use object storage:

```text
Frontend
   ↓
Upload API
   ↓
Object Storage
   ↓
Document Metadata → PostgreSQL
```

Store only:

```text
document_id
employee_id
file_name
storage_key
mime_type
size
version
created_at
expires_at
```

---

# 39. Reporting

HR should be able to generate:

* Employee report
* Attendance report
* Leave report
* Payroll report
* Recruitment report
* Attrition report
* Performance report
* Department report
* Hiring report

Export:

```text
CSV
Excel
PDF
```

Reports should be generated asynchronously for large datasets.

---

# 40. Important HR Requirements

The system should support:

### Employee lifecycle

```text
Recruit
 ↓
Interview
 ↓
Hire
 ↓
Onboard
 ↓
Manage
 ↓
Develop
 ↓
Promote
 ↓
Retain
 ↓
Offboard
```

### Centralized HR data

One employee should have one canonical employee record.

Avoid having separate employee records for:

* Attendance
* Payroll
* Leave
* Performance
* Recruitment

Instead use:

```text
Employee
   |
   ├── Attendance
   ├── Leave
   ├── Payroll
   ├── Performance
   ├── Documents
   └── Employment History
```

---

# 41. MVP

The first version should focus on:

1. Authentication
2. HR dashboard
3. Employee management
4. Departments
5. Recruitment
6. Candidates
7. Interviews
8. Offers
9. Onboarding
10. Attendance
11. Leave
12. Documents
13. Performance
14. HR tickets
15. RBAC
16. Audit logs
17. Keka integration

Payroll can initially be **Keka-powered** rather than implementing a complete payroll engine internally.

---

# 42. Phase 2

After the MVP:

* Advanced analytics
* AI HR assistant
* Automated candidate screening
* AI interview summaries
* Employee engagement
* Surveys
* Advanced performance analytics
* Compensation planning
* Workforce planning
* Automated onboarding
* Advanced Keka synchronization
* Mobile application

---

# 43. AI HR Assistant

Eventually, the system can provide an AI assistant for HR.

Example:

> "How many employees joined Engineering this quarter?"

> "Which department has the highest attrition?"

> "Show employees whose documents expire next month."

> "How many candidates are currently in technical interviews?"

The AI should **not directly query the database unrestrictedly**.

Use:

```text
HR User
 ↓
AI Assistant
 ↓
Permission Check
 ↓
Intent Detection
 ↓
Approved Tool
 ↓
Database/API
 ↓
Result
```

This prevents an HR user from asking the AI to expose data they do not have permission to access.

---

# 44. Final Architecture

The complete platform should ultimately look like:

```text
                    HR CONTROLLER
                         |
        ┌────────────────┼────────────────┐
        |                |                |
   Recruitment       Employees        Organization
        |                |                |
   Candidates        Attendance       Departments
   Interviews        Leave            Designations
   Offers            Payroll
   Onboarding        Performance
                     Documents
                     Expenses
                     Exit
                         |
                  ┌──────┴──────┐
                  |             |
               Analytics      AI HR
                  |           Assistant
                  |
             Integrations
                  |
                Keka
```

The most important architectural principle is: **the HR Controller should be the central system of orchestration, while specialized systems such as Keka remain integrations rather than being tightly coupled into every module.**
