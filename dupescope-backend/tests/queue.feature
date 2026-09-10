Feature: Queue and pagination
  As a developer
  I want the job queue and file listing to work reliably
  So the frontend can manage large photo jobs

  Background:
    Given the DupeScope server is running

  Scenario: Submitting a scan returns a job_id
    Given a temporary folder with 2 jpg images
    When I submit a real scan
    Then the response status should be 200
    And the response should contain "job_id"

  Scenario: Queue full returns 503
    Given a temporary folder with 2 jpg images
    When I submit a real scan
    And the queue is blocked with small cap
    And I submit a real scan with same folder
    Then the second response status should be 503
    And the second response body should contain "Queue full"

  Scenario: Job list includes submitted job
    Given a scan job has been started in test mode
    When I GET "/jobs/list"
    Then the response status should be 200
    And the response should contain "jobs"
    And the job list should include the submitted job

  Scenario: WebSocket subscribe returns snapshot
    Given a scan job has been started in test mode
    When I subscribe to the job via WebSocket
    Then I should receive a snapshot event with status

  Scenario: Cancel a queued job
    Given a temporary folder with 2 jpg images
    When the queue worker is blocked
    And I submit a real scan
    And I submit a real scan
    And I cancel the queued job
    Then the cancel response status should be 200
    And the cancel response body should be "cancelled"
    And the job status should be "cancelled"
