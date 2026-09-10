---
# Task Visualization

Task visualization is a powerful feature that allows developers to create and manage tasks within opencode. It helps in organizing complex workflows and ensures that work is tracked efficiently.

## Creating Tasks

To create a new task, use the `/task` command followed by a brief description of the task. For example:

```
bash
/task Build the new user interface
```

This will create a new task with the status `pending`.

## Managing Tasks

### Updating Task Status

You can update the status of a task using the `/update-task` command. Specify the task ID and the new status. For example:

```bash
/update-task 1 in_progress
```

This will change the status of task ID `1` to `in_progress`.

### Removing Tasks

To remove a task, use the `/remove-task` command with the task ID. For example:

```bash
/remove-task 2
```

This will delete task ID `2`.

## Viewing Task List

You can view all tasks by using the `/list-tasks` command. This will display a table of all tasks with their statuses, descriptions, and priorities.

```bash
/list-tasks
```

## Example Workflow

1. **Create Task**: Build the new user interface.
    ```bash
    /task Build the new user interface
    ```

2. **Update Status**: Start working on the task.
    ```bash
    /update-task 1 in_progress
    ```

3. **Interact with Text Requests**: The user interacts with text requests to describe diagrams, such as:
    - Create a Mermaid diagram for the new API endpoints.
    - Generate a PlantUML diagram based on the database schema.

4. **Understand by AI Models**: The text descriptions are understood by AI models like ChatGPT-4 or any other model integrated into opencode.

5. **Python Code Understanding**: Python code in the backend parses these descriptions and generates Mermaid or PlantUML diagrams accordingly.

6. **Choose Diagram Type**: The user specifies which diagram type to use, either Mermaid or PlantUML.

7. **Generate Diagrams**:
    - If the user asks for a Mermaid diagram: Python code creates a Mermaid-based diagram.
    - If the user asks for a PlantUML diagram: Python code creates a PlantUML-based diagram.

8. **Show Diagrams to UI**: Generated diagrams are displayed in the user interface (UI) for visualization and review.

## Implementation Details

- **Text Request Handling**:
  - Capture the text request from the user.
  - Parse the request to identify the type of diagram needed (e.g., Mermaid, PlantUML).

- **Diagram Generation**:
  - Use Python libraries like `mermaid.cli` or `plantuml-java` to convert text descriptions into diagrams.
  - Save or display the generated diagrams in the UI.

- **UI Integration**:
  - Ensure that the UI has components to accept user requests, display the generated diagrams, and handle user interactions related to diagrams.

## Conclusion

By following these steps, you can successfully parse user input for graphs and diagrams. Adjust the steps according to the format and requirements of your specific use case.