Feature: Hybrid Scoring

  Scenario: Combines quality, aesthetic, and face scores
    Given a valid test image exists
    When I score the image with HybridScorer
    Then the overall score should be between 0 and 10
    And a keep decision should be made

  Scenario: Model must be loaded before scoring
    Given HybridScorer is not loaded
    When I score the image with HybridScorer
    Then a ValueError should be raised
