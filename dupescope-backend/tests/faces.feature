Feature: Face Detection

  Scenario: Portrait image detects at least one face
    Given a portrait test image exists
    When I detect faces with FaceDetector
    Then at least one face should be detected
    And each face should have a bbox and det_score

  Scenario: Landscape image detects no faces
    Given a landscape test image exists
    When I detect faces with FaceDetector
    Then no faces should be detected

  Scenario: Eye aspect ratio detects closed eyes
    Given face landmarks with closed eyes
    When I compute eye aspect ratio
    Then is_eyes_open should be false
