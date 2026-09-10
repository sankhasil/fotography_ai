Feature: Server API contract
  As a developer
  I want the FastAPI server to serve correct responses
  So the frontend can reliably communicate with it

  Background:
    Given the DupeScope server is running

  Scenario: Photo count for valid folder
    Given a temporary folder with 5 jpg images
    When I GET "/photos/count?folder={folder}&recursive=true"
    Then the response status should be 200
    And the response should contain "total" equal to 5

  Scenario: Photo count for missing folder
    When I GET "/photos/count?folder=/nonexistent/path&recursive=true"
    Then the response status should be 404

  Scenario: Start scan returns job_id
    Given a temporary folder with 3 jpg images
    When I start a scan in test mode
    Then the response status should be 200
    And the response should contain "job_id"

  Scenario: Job status returns valid state
    Given a scan job has been started in test mode
    When I GET "/jobs/{job_id}"
    Then the response status should be 200
    And the response should contain "status"

  Scenario: Job status returns 404 for unknown job
    When I GET "/jobs/nonexistent-id"
    Then the response status should be 404

  Scenario: Approve endpoint returns approved
    Given a scan job has been started in test mode
    When I POST "/jobs/{job_id}/approve"
    Then the response status should be 200
    And the response should contain "status" equal to "approved"

  Scenario: Undo endpoint restores files
    Given a scan job with archived files
    When I POST "/jobs/{job_id}/undo"
    Then the response status should be 200
    And the response should contain "restored"

  Scenario: Invalid folder path is rejected
    When I start a scan with empty folder
    Then the response status should be 400

  Scenario: Job list returns jobs
    Given a scan job has been started in test mode
    When I GET "/jobs/list"
    Then the response status should be 200
    And the response should contain "jobs"
