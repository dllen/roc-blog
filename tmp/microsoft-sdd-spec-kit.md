# Diving Into Spec-Driven Development With GitHub Spec Kit

Link: https://developer.microsoft.com/blog/spec-driven-development-spec-kit

[Den Delimarsky](https://devblogs.microsoft.com/blog/author/ddelimarskyms)

Principal Product Engineer

September 15th, 2025

## Check Out GitHub Spec Kit

[Go To Project Repo](https://github.com/github/spec-kit)

Developers are increasingly relying on AI agents to both build new software as well as extend capabilities of existing projects that they support. One challenge with AI-based systems, however, is that to produce the right output you need to first establish _really good context_. If you don’t decide what you’re building and why you’re building it ahead of time, the codebase becomes the de-facto specification – a collection of seemingly disjoint components that can work together but are hard to maintain, evolve, and debug.

Code is really not the best medium for requirements negotiation – nobody wants to write the code first and then incrementally make adjustments as requirements start emerging and technical architecture locks developers to a solution. Code is inherently a _binding_ _artifact_ – once you write an implementation, it’s very hard to decouple from it. Any major rewrites or experiments will undoubtedly require a lot of effort from a large team.

This is why last week [GitHub announced Spec Kit](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/).

GitHub Spec Kit brings a new approach to AI-based software development workflows – instead of vibe coding every new feature and bug fix teams can preemptively outline the concrete project requirements, motivations, and technical aspects before handing that off to AI agents and have them build _exactly_ what was needed in the first place. If you’ve ever worked with product managers that had to put together Product Requirements Documents (PRDs) that need to be reviewed and then implemented, you might hear some echoes of a familiar process.

## What Is Spec-Driven Development

Spec-Driven Development, or SDD, is **not** about writing exhaustive, dry requirements documents that nobody reads. It’s also **not** about waterfall planning or trying to predict the future through extensive planning exercises. And it’s **definitely not** about creating more bureaucracy that slows engineering teams down.

SDD is about making your technical decisions explicit, reviewable, and evolvable. Think of it as version control for your thinking. Instead of having crucial architectural decisions trapped in email threads, scattered documents, or locked in someone’s head, you capture the “why” behind your technical choices in a format that can grow with your project and your understanding of the problem space.

Picture this: You’re three sprints into building a notification system. The PM thought “notification preferences” meant per-channel toggles. The backend engineer built it as a single on/off switch. The frontend developer assumed it would integrate with the user’s OS notification settings. And the designer? They mocked up something that would require rebuilding half the user service. This isn’t a failure of communication – it’s a failure of **shared context**. Everyone made reasonable assumptions based on incomplete information. SDD gives you a lightweight way to surface those assumptions early, when changing direction costs a few keystrokes instead of entire sprints.

Specs become **living documents** that evolve alongside your code, not dusty artifacts that you write once and forget. They are active tools that help you think through edge cases, coordinate across teams, and onboard new people. When done right, updating the spec becomes as natural as refactoring code – without actually touching any code.

This is _especially_ critical for processes that rely on AI agents to build products as **shared context** becomes a valuable asset that can steer the agent to the right solution. Because specifications are themselves detached from code, it’s possible to go as far as to create multi-variant implementations with ease. Curious about the performance difference between one component written in Rust and another in Go is? Ask the AI agent to produce two completely different implementations based on the spec. Exploring several design directions for a feature? Ask the AI agent to create several implementations that rely on different Figma mocks exposed through the [Figma MCP server](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Dev-Mode-MCP-Server). SDD unlocks new scenarios that are not reliant on one rigid implementation.

This is where [GitHub Spec Kit](https://github.com/github/spec-kit) comes in.

## Getting Started with Spec Kit

GitHub Spec Kit is our approach to bringing SDD practices to life. To get a full overview of the GitHub Spec Kit project, you can start by watching the [guide video](https://www.youtube.com/watch?v=a9eR1xsfvHg&pp=ygUIc3BlYyBraXQ%3D) on this project:

GitHub Spec Kit has two key components that will be interesting for us to explore:

* **Specify CLI**. A helper CLI that bootstraps your projects for SDD. It downloads the official templates from the GitHub repo for the coding agent and platform of your choice and sets up the SDD scaffolding in a way that the agent can start iterating on it.
* **A set of templates and helper scripts**. This establishes the foundation for our SDD experience. Templates define what a spec looks like, what a technical plan encompasses for a given project, and how all of this is broken down into individual tasks that an AI agent can pick up and execute.

There is no magic beyond these two parts of the toolkit. You can even manage templates manually if you download them from the [Releases tab in the GitHub repo](https://github.com/github/spec-kit/releases) and extract directly within your project folder. GitHub Spec Kit was designed to work in the environment you’re already building your software in.

## Specify CLI

A big part of GitHub Spec Kit is the built-in CLI. The Specify CLI is a Python-based tool that can be used to quickly set your project up for SDD. You can install it directly with the help of [uvx](https://docs.astral.sh/uv/guides/tools/) and bootstrap your project in just one command:

```py
uvx --from git+https://github.com/github/spec-kit.git specify init <PROJECT_NAME>
```

When you run Specify, you will be prompted to select one of the supported coding agents. Specify is cross-agent by default – the built-in templates are designed in a way that makes the compatible with most modern agents without any tweaks. Specify will ensure that it downloads the right version for the agent that you’re building with.

The bundled helper scripts are also available in two flavors. For POSIX-compatible systems, like Linux, macOS, or even inside Windows Subsystem for Linux, you can use shell scripts. On native Windows environments – PowerShell scripts are right there as well.

[](https://devblogs.microsoft.com/wp-content/uploads/2025/09/uvx-specify-install.gif)

Once Specify bootstraps the project, you will see two new folders created within your project – `.github` and `.specify`:

```regex
├───.github
│   └───prompts
│           plan.prompt.md
│           specify.prompt.md
│           tasks.prompt.md
│
└───.specify
    ├───memory
    │       constitution.md
    │       constitution_update_checklist.md
    │
    ├───scripts
    │   └───powershell
    │           check-task-prerequisites.ps1
    │           common.ps1
    │           create-new-feature.ps1
    │           get-feature-paths.ps1
    │           setup-plan.ps1
    │           update-agent-context.ps1
    │
    └───templates
            agent-file-template.md
            plan-template.md
            spec-template.md
            tasks-template.md
```

The `.specify` folder contains all of the SDD templates, such as the ones for the spec, technical plan, and tasks, along with the scripts for the platform you chose. The agent-specific folder, such as `.github` for GitHub Copilot, will contain the prompt definitions that can help you follow the SDD process without manually typing the actual process requirements. Agent-specific prompts can also most commonly be used through slash commands – in our case, `/specify`, `/plan`, and `/tasks`.

In addition to the above, GitHub Spec Kit introduces an extra file that you might not have seen before – `constitution.md`. In the SDD context, a _constitution document_ establishes a set of non-negotiable principles for your project. For example, your organization might have a set of requirements around testing approaches for web applications. Or maybe there is a convention where every application that is being built by a specific team should always be CLI-first. All of these can be captured in the constitution document before any of the SDD-based iteration is tackled. This is also a powerful tool for organizations to establish **opinionated stacks** – a set of conventions that guide the development and evolution of every new and existing project.

And of course – the helper scripts that are in the `powershell` or `bash` folders are invoked from within individual prompts to help ensure that the SDD scaffolding is applied consistently. When Specify first bootstraps your project it ensures that it either is creating one for you. The scripts then help the agent manage source consistency and ensure that all operations are done within the same feature branch, as well as that all subsequent prompts have proper references to previously-created artifacts, such as the spec, the plan, and the data contracts that the agent generated for your project.

## Slash Commands

To make it easier to follow the SDD process, we introduced three slash commands that are available for all supported coding agents:

| Command  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| /specify | Outline the “what” and the “why” of your project. This is what will be used to bootstrap the Product Requirements Document (PRD) for your project, feature, or change. This step **explicitly excludes technical decision making** – you’re not defining the tech stack but rather focus on motivations and functional requirements.                                                                                                                                                   |
| /plan    | Outline the “how” of the project – what frameworks, libraries, databases, or infrastructure needs to be used. This will generate a plan, along with additional metadata, such as research, data contracts, and a quickstart that will outline how your teammates can get started with building and experimenting with the projects. This plan is grounded by the _constitution_ we mentioned above, ensuring that all decisions fit with the prescriptive guidance you’ve established. |
| /tasks   | Breaks down the spec and plan into manageable, phased chunks that the AI agent can tackle to implement the project.                                                                                                                                                                                                                                                                                                                                                                    |

Each slash command has to be used sequentially – first, you create the spec with `/specify`. Then, you establish the technical requirements with `/plan`. Next, you break this down into manageable chunks with `/tasks`.

Once you’re satisfied with the requirements, plan, and task breakdown – simply ask your agent to implement the project based on the outlined tasks.

[](https://devblogs.microsoft.com/wp-content/uploads/2025/09/specify-command.gif)

It’s worth noting that as you are using the slash commands that Specify injected into the project, having a **very detailed first prompt** will produce a much better specification that the agent can use for further project buildouts.

Think through the project requirements and what you want and don’t want to see in the final output. For the specification, are there particular experiences that are critical to the success of what you are building? For the technical plan, how important is it to pick a specific library instead of letting AI make that choice for you? The more detail you can bake into the guiding prompt, the more likely you are to spend less time tweaking the produced documents.

As you go through individual steps, your AI agent will create new artifacts within the `specs` folder. You can review and adjust them manually or with the help of your agent – they’re plain Markdown files and you can easily change them as you see fit for your project.

While the SDD process itself is flexible and gives you a lot of control over the project details, GitHub Spec Kit bakes in some assumptions around _how_ projects are built. You can see those when you inspect any of the bundled templates. If you feel that one or more parts of the scaffolding are not what you want for your project, feel free to modify the prompts and the templates that are provided inside the `.specify` folder to fit your needs. The scaffolding that is provided out-of-the-box is an example implementation that we’ve seen successfully used for a range of projects, but it certainly can be extended and tweaked to fit specific organizational requirements.

## We Want Your Feedback

First and foremost, GitHub Spec Kit is an _experiment_ – there
