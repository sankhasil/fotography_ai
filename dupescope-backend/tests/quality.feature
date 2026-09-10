Feature: Quality Scoring

  Scenario: Valid image returns quality score between 0 and 10
    Given a valid test image exists
    When I score the image with QualityScorer
    Then the overall score should be between 0 and 10

  Scenario: Blurry image scores below 3
    Given a blurry test image exists
    When I score the image with QualityScorer
    Then the overall score should be below 3
    And is_blurry should be true

  Scenario: Missing file returns error result
    Given a non-existent file path
    When I score the image with QualityScorer
    Then the method should be "error"
