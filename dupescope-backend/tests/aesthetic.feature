Feature: Aesthetic Scoring

  Scenario: Valid image returns aesthetic score between 0 and 10
    Given a valid test image exists
    When I score the image with AestheticScorer
    Then the aesthetic_score should be between 0 and 10
    And the method should be "CLIP-ViT-L14"

  Scenario: Model must be loaded before scoring
    Given AestheticScorer is not loaded
    When I score the image with AestheticScorer
    Then a ValueError should be raised
