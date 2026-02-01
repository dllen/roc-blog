# Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl

Link: https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html

[![Photo of Birgitta Böckeler](bb.jpg)](https://birgitta.info)

[Birgitta Böckeler](https://birgitta.info)

Birgitta is a Distinguished Engineer and AI-assisted delivery expert at Thoughtworks. She has over 20 years of experience as a software developer, architect and technical leader.

[![](donkey-card.png)](../exploring-gen-ai.html)

This article is part of [“Exploring Gen AI”](../exploring-gen-ai.html). A series capturing Thoughtworks technologists' explorations of using gen ai technology for software development.

15 October 2025

I’ve been trying to understand one of the latest AI coding buzzword: Spec-driven development (SDD). I looked at three of the tools that label themselves as SDD tools and tried to untangle what it means, as of now.

## Definition

Like with many emerging terms in this fast-paced space, the definition of “spec-driven development” (SDD) is still in flux. Here’s what I can gather from how I have seen it used so far: Spec-driven development means writing a “spec” before writing code with AI (“documentation first”). The spec becomes the source of truth for the human and the AI.

[GitHub](https://github.com/github/spec-kit/blob/main/spec-driven.md): “In this new world, _maintaining software means evolving specifications_. \\[…\\] The lingua franca of development moves to a higher level, and code is the last-mile approach.”

[Tessl](https://docs.tessl.io/introduction-to-tessl/concepts): “A development approach where _specs — not code — are the primary artifact_. Specs describe intent in structured, testable language, and agents generate code to match them.”

After looking over the usages of the term, and some of the tools that claim to be implementing SDD, it seems to me that in reality, there are multiple implementation levels to it:

1. **Spec-first**: A well thought-out spec is written first, and then used in the AI-assisted development workflow for the task at hand.
2. **Spec-anchored**: The spec is kept even after the task is complete, to continue using it for evolution and maintenance of the respective feature.
3. **Spec-as-source**: The spec is the main source file over time, and only the spec is edited by the human, the human never touches the code.

All SDD approaches and definitions I’ve found are spec-first, but not all strive to be spec-anchored or spec-as-source. And often it’s left vague or totally open what the spec maintenance strategy over time is meant to be.

![An illustration of the three observed levels of SDD, in 2 columns of “Creation of feature” and “Evolution and maintenance of feature”, each level shown in a row. Spec-first: Spec documents lead to code, both specs and code are marked with a robot and human icon, to show that both AI and humans are editing specs and code. Then after creation of feature, the specs are deleted, and during evolution a new spec is created that describes the change. Next row is spec-anchored, shows the same as spec-first, but the spec is not deleted after creation, instead it gets edited during evolution. Final row is spec-as-source, same as spec-anchored, but the human icon is crossed out for the code files, because humans here do not edit the code. All three concepts are connected with inheritance arrows (arrow with a head that is not filled with color), because they build up on top of each other.](sdd-levels.png)

## What is a spec?

The key question in terms of definitions of course is: What is a spec? There doesn’t seem to be a general definition, the closest I’ve seen to a consistent definition is the comparison of a spec to a “Product Requirements Document”.

The term is quite overloaded at the moment, here is my attempt at defining what a spec is:

A spec is a structured, behavior-oriented artifact - or a set of related artifacts - written in natural language that expresses software functionality and serves as guidance to AI coding agents. Each variant of spec-driven development defines their approach to a spec’s structure, level of detail, and how these artifacts are organized within a project.

There is a useful difference to be made I think between specs and the more general context documents for a codebase. That general context are things like rules files, or high level descriptions of the product and the codebase. Some tools call this context a [**memory bank**](https://docs.cline.bot/prompting/cline-memory-bank), so that’s what I will use here. These files are relevant across all AI coding sessions in the codebase, whereas specs only relevant to the tasks that actually create or change that particular functionality.

![An overview diagram showing agent context files in two categories: Memory Bank (AGENTS.md, project.md, architecture.md as examples), and Specs (Story-324.md, product-search.md, a folder feature-x with files like data-model.md, plan.md as example files).](sdd-overview.png)

## The challenge with evaluating SDD tools

It turns out to be quite time-consuming to evaluate SDD tools and approaches in a way that gets close to real usage. You would have to try them out with different sizes of problems, greenfield, brownfield, and really take the time to review and revise the intermediate artifacts with more than just a cursory glance. Because as [GitHub’s blog post about spec-kit](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/) says: “Crucially, your role isn’t just to steer. It’s to verify. At each phase, you reflect and refine.”

For two of the three tools I tried it also seems to be even more work to introduce them into an existing codebase, therefore making it even harder to evaluate their usefulness for brownfield codebases. Until I hear usage reports from people using them for a period of time on a “real” codebase, I still have a lot of open questions about how this works in real life.

That being said - let’s get into three of these tools. I will share a description of how they work first (or rather how I think they work), and will keep my observations and questions for the end. Note that these tools are very fast evolving, so they might have already changed since I used them in September.

## Kiro

[Kiro](https://kiro.dev/) is the simplest (or most lightweight) one of the three I tried. It seems to be mostly spec-first, all the examples I have found use it for a task, or a user story, with no mention of how to use the requirements document in a spec-anchored way over time, across multiple tasks.

**Workflow:** Requirements → Design → Tasks

Each workflow step is represented by one markdown document, and Kiro guides you through those 3 workflow steps inside of its VS Code based distribution.

**Requirements:** Structured as a list of requirements, where each requirement represents a “User Story” (in “As a…” format) with acceptance criteria (in “GIVEN… WHEN… THEN…” format)

![A screenshot of a Kiro requirements document](sdd-kiro-requirements-example.png)

**Design:** In my attempt, the design document consisted of the sections seen in the screenshot below. I only have the results of one of my attempts still, so I’m not sure if this is a consistent structure, or if it changes depending on the task.

![A screenshot of a Kiro design document, showing a component architecture diagram, and then collapsed sections titled Data Flow, Data Models, Error Handling, Testing Strategy, Implementation Approach, Migration Strategy](sdd-kiro-design-example.png)

**Tasks:** A list of tasks that trace back to the requirement numbers, and that get some extra UI elements to run tasks one by one, and review changes per task.

![A screenshot of a Kiro tasks document, showing a task with UI elements “Task in progress”, “View changes” next to them. Each task is a bullet list of TODOs, and ends with a list of requirement numbers (1.1, 1.2, 1.3)](sdd-kiro-tasks-example.png)

Kiro also has the concept of a memory bank, they call it “steering”. Its contents are flexible, and their workflow doesn’t seem to rely on any specific files being there (I made my usage attempts before I even discovered the steering section). The default topology created by Kiro when you ask it to generate steering documents is product.md, structure.md, tech.md.

![A version of the earlier overview diagram, this time specific to Kiro: The memory bank has 3 files in a steering folder called product.md, tech.md, structure.md, and the specs box shows a folder called category-label-enhancement (the name of my test feature) that contains requirements.md, design.md, tasks.md](sdd-overview-kiro.png)

## Spec-kit

[Spec-kit](https://github.com/github/spec-kit) is GitHub’s version of SDD. It is distributed as a CLI that can create workspace setups for a wide range of common coding assistants. Once that structure is set up, you interact with spec-kit via slash commands in your coding assistant. Because all of its artifacts are put right into your workspace, this is the most customizable one of the three tools discussed here.

![Screenshot of VS Code showing the folder structure that spec-kit set up on the left (command files in .github/prompts, a .specify folder with subfolders memory, scripts, templates); and GitHub Copilot open on the right, where the user is in the process of typing /specify as a command](sdd-spec-kit-file-setup-example.png)

**Workflow:** Constitution → 𝄆 Specify → Plan → Tasks 𝄇

Spec-kit’s memory bank concept is a prerequisite for the spec-driven approach. They call it a [**constitution**](https://github.com/github/spec-kit/blob/main/spec-driven.md#the-constitutional-foundation-enforcing-architectural-discipline). The constitution is supposed to contain the high level principles that are “immutable” and should always be applied, to every change. It’s basically a very powerful rules file that is heavily used by the workflow.

In each of the workflow steps (specify, plan, tasks), spec-kit instantiates a set of files and prompts with the help of a bash script and some templates. The workflow then makes heavy use of checklists inside of the files, to track necessary user clarifications, constitution violations, research tasks, etc. They are like a “definition of done” for each workflow step (though interpreted by AI, so there is no 100% guarantee that they will be respected).

![A partial screenshot of the very end of the spec.md file, showing a bunch of checklists for content quality, requirement completeness, execution status.](sdd-spec-kit-spec-example.png)

Below is an overview to illustrate the file topology I saw in spec-kit. Note how one spec is made up of many files.

![A version of the earlier overview diagram, this time specific to spec-kit: The memory bank has a constitution.md file. There is an extra box labelled “templates” which is an additional concept in spec-kit, with template files for plan, spec, and tasks. The specs box shows a folder called “specs/001-when-a-user” (yes, that’s what spec-kit called it in my test) that contains 8 files, data-model, plan, tasks, spec, research, api, component.](sdd-overview-spec-kit.png)

At first glance, GitHub seems to be [aspiring to a spec-anchored approach](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/) (“That’s why we’re rethinking specifications — not as static documents, but as living, executable artifacts that evolve with the project. Specs become the shared source of truth. When something doesn’t make sense, you go back to the spec; when a project grows complex, you refine it; when tasks feel too large, you break them down.”) However, spec-kit creates a branch for every spec that gets created, which seems to indicate that they see a spec as a living artifact for the lifetime of a change request, not the lifetime of a feature. [This community discussion](https://github.com/github/spec-kit/discussions/152) is talking about this confusion. It makes me think that spec-kit is still what I would call spec-first only, not spec-anchored over time.

## Tessl Framework

_(Still in private beta)_

Like spec-kit, the [Tessl Framework](https://docs.tessl.io/introduction-to-tessl/quick-start-guide-tessl-framework) is distributed as a CLI that can create all the workspace and config structure for a variety of coding assistants. The CLI command also doubles as an MCP server.

![Screenshot of Cursor, showing the files Tessl created in the file tree (.tessl/framework folder), and the open MCP configuration on the right, which starts the tessl command in MCP mode](sdd-tessl-file-setup-example.png)

Tessl is the only one of these three tools that explicitly aspires to a spec-anchored approach, and is even exploring the spec-as-source level of SDD. A Tessl spec can serve as the main artifact that is being maintained and edited, with the code even marked with a comment at the top saying `// GENERATED FROM SPEC - DO NOT EDIT`. This is currently a 1:1 mapping between spec and code files, i.e. one spec translates into one file in the codebase. But Tessl is still in beta and they are experimenting with different versions of this, so I can imagine that this approach could also be taken on a level where one spec maps to a code component with multiple files. It remains to be seen what the alpha product will support. (The Tessl team themselves see their framework as something that is more in the future than their current public product, the Tessl Registry.)

Here is an example of a spec that I had the Tessl CLI reverse engineer (`tessl document --code ...js`) from a JavaScript file in an existing codebase:

![A screenshot of a Tessl spec file](sdd-tessl-spec-example.png)

Tags like `@generate` or `@test` seem to tell Tessl what to generate. The API section shows the idea of defining at least the interfaces that get exposed to other parts of the codebase in the spec, presumably to make sure that these more crucial parts of the generated component are fully under the control of the maintainer. Running `tessl build` for this spec generates the corresponding JavaScript code file.

Putting the specs for spec-as-source at a quite low abstraction level, per code file, probably reduces amount of steps and interpretations the LLM has to do, and therefore the chance of errors. Even at this low abstraction level I have seen the non-determinism in action though, when I generated code multiple times from the same spec. It was an interesting exercise to iterate on the spec and make it more and more specific to increase the repeatability of the code generation. That process reminded me of some of the pitfalls and challenges of writing an unambiguous and complete specification.

![A version of our earlier overview diagram, this time specific to Tessl: The memory bank box has a folder .tessl/framework with 4 files, plus KNOWLEDGE.md and AGENTS.md. The specs box shows a file dynamic-data-renderer.spec.md, a spec file. This diagram also has a box for Code, including a file dynamic-data-renderer.js. There is a bidirectional arrow between the Specs and the Code box, as in the Tessl case, those two are synced with each other.](sdd-overview-tessl.png)

## Observations and questions

These three tools are all labelling themselves as implementations of spec-driven development, but they are quite different from each other. So that’s the first thing to keep in mind when talking about SDD, it is not just one thing.

### One workflow to fit all sizes?

Kiro and spec-kit provide one opinionated workflow each, but I’m quite sure that neither of them is suitable for the majority of real life coding problems. In particular, it’s not quite clear to me how they would cater to enough different problem sizes to be generally applicable.

When I asked Kiro to fix a small bug ([it was the same one I used in the past to try Codex](https://martinfowler.com/articles/exploring-gen-ai/autonomous-agents-codex-example.html)), it quickly became clear that the workflow was like using a sledgehammer to crack a nut. The requirements document turned this small bug into 4 “user stories” with a total of 16 acceptance criteria, including gems like “User story: As a developer, I want the transformation function to handle edge cases gracefully, so that the system remains robust when new category formats are introduced.”

I had a similar challenge when I used spec-kit, I wasn’t quite sure what size of problem to use it for. Available tutorials are usually based on creating an application from scratch, because that’s easiest for a tutorial. One of the use cases I ended up trying was a feature that would be a 3-5 point story on one of my past teams. The feature depended on a lot of code that was already there, it was supposed to build an overview modal that summarised a bunch of data from an existing dashboard. With the amount of steps spec-kit took, and the amount of markdown files it created for me to review, this again felt like overkill for the size of the problem. It was a bigger problem than the one I used with Kiro, but also a much more elaborate workflow. I never even finished the full implementation, but I think in the same time it took me to run and review the spec-kit results I could have implemented the feature with “plain” AI-assisted coding, and I would have felt much more in control.

An effective SDD tool would at the very least have to provide flexibility for a few different core workflows, for different sizes and types of changes.

### Reviewing markdown over reviewing code?

As just mentioned, and as you can see in the description of the tool above, spec-kit created a LOT of markdown files for me to review. They were repetitive, both with each other, and with the code that already existed. Some contained code already. Overall they were just very verbose and tedious to review. In Kiro it was a little easier, as you only get 3 files, and it’s more intuitive to understand the mental model of “requirements > design > tasks”. However, as mentioned, Kiro also was way too verbose for the small bug I was asking it to fix.

To be honest, I’
