Feature: Foundation cleanup and bug fixes
  As a developer
  I want dead code removed and bugs fixed
  So the codebase is clean and correct

  Scenario: Dead files are removed
    Then the file "dupfotofinder.py" should not exist
    And the file "process_dupescope_report.py" should not exist

  Scenario: ssim_similarity is defined exactly once
    When I count definitions of "ssim_similarity" in "dupescope/core.py"
    Then there should be exactly 1 definition

  Scenario: The package structure exists
    Then the directory "dupescope" should exist
    And the file "dupescope/__init__.py" should exist
    And the directory "dupescope/scoring" should exist
    And the file "dupescope/scoring/__init__.py" should exist
    And the directory "dupescope/pipeline" should exist
    And the file "dupescope/pipeline/__init__.py" should exist

  Scenario: Server does not have bare signal handlers outside __main__
    When I check signal handler registration in "server.py"
    Then signal handlers should be inside the __main__ block

  Scenario: Server uses threading.Event instead of busy-wait
    When I check the worker function in "server.py"
    Then the worker should use threading.Event for approval wait
    And the worker should not have a "while True" + "time.sleep" busy-wait loop

  Scenario: scan_images still works after refactor
    Given a temporary folder with 3 jpg images
    When I call scan_images on the folder recursively
    Then 3 images should be returned

  Scenario: find_exact_dupes identifies duplicates
    Given a temporary folder with 2 identical images and 1 unique image
    When I call find_exact_dupes on all images
    Then 1 group of exact duplicates should be found

  Scenario: fmt_bytes formats correctly
    When I call fmt_bytes with 1024
    Then the result should be "1.0 KB"
