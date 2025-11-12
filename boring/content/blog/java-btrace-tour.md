---
title: "BTrace User's Guide"
date: 2020-03-18T12:13:32+05:30
update_date: 2020-03-18T12:13:32+05:30
description: "BTrace User's Guide"
tags: [java, btrace]
---

- [原文地址](https://gist.github.com/yulewei/53339ccced8837686895e3c9f45557cc)

- [实验Demo](https://gitee.com/dllen/dllen-demos/tree/master/btrace-demo)

> 注意：btrace 版本和包名已经更新，编写 btrace 脚本时使用以下依赖，但是整体使用方式基本没有变化；
> 
> Q：Maven 无法下载 BTrace 的包。
> 
> A：手动将 BTrace bin 文件夹下的 jar 安装到本地 Maven 仓库。
> 
> ```bash
> export BTRACE_HOME=
> 
> mvn install:install-file -Dfile=${BTRACE_HOME}/libs/btrace-agent.jar -DgroupId=org.openjdk.btrace -DartifactId=btrace-agent -Dversion=2.1.1 -Dpackaging=jar
> mvn install:install-file -Dfile=${BTRACE_HOME}/libs/btrace-client.jar -DgroupId=org.openjdk.btrace -DartifactId=btrace-client -Dversion=2.0.1 -Dpackaging=jar
> mvn install:install-file -Dfile=${BTRACE_HOME}/libs/btrace-boot.jar -DgroupId=org.openjdk.btrace -DartifactId=btrace-boot -Dversion=2.0.1 -Dpackaging=jar
> ```
> 
> 
> 
> ```xml
> <dependency>
>     <groupId>org.openjdk.btrace</groupId>
>     <artifactId>btrace-client</artifactId>
>     <version>2.1.0</version>
> </dependency>
> <dependency>
>     <groupId>org.openjdk.btrace</groupId>
>     <artifactId>btrace-boot</artifactId>
>     <version>2.1.0</version>
> </dependency>
> <dependency>
>     <groupId>org.openjdk.btrace</groupId>
>     <artifactId>btrace-agent</artifactId>
>     <version>2.1.0</version>
> </dependency>
> ```

# BTrace User's Guide

<https://github.com/btraceio/btrace/blob/master/docs/usersguide.html>
<https://web.archive.org/web/20170410014122/https://kenai.com/projects/btrace/pages/UserGuide>

* [BTrace Terminology](#btrace-terminology)
* [BTrace Program Structure](#btrace-program-structure)
* [BTrace Restrictions](#btrace-restrictions)
* [A simple BTrace program](#a-simple-btrace-program)
* [Steps to run BTrace](#steps-to-run-btrace)
* [BTrace Command Line](#btrace-command-line)
  * [optional](#optional)
* [Pre-compiling BTrace scripts](#pre-compiling-btrace-scripts)
* [Starting an application with BTrace agent](#starting-an-application-with-btrace-agent)
* [BTrace Annotations](#btrace-annotations)
  * [Method Annotations](#method-annotations)
  * [Argument Annotations](#argument-annotations)
  * [Field Annotations](#field-annotations)
  * [Class Annotations](#class-annotations)
* [DTrace Integration](#dtrace-integration)
* [BTrace Samples](#btrace-samples)

---

 **BTrace** is a safe, dynamic tracing tool for Java. BTrace works by dynamically (bytecode) instrumenting classes of a running Java program. BTrace inserts tracing actions into the classes of a running Java program and hotswaps the traced program classes. 

## BTrace Terminology

  **Probe Point**<br/>
  "location" or "event" at which a set of tracing statements are executed. Probe point is "place" or "event" of interest where we want to execute some tracing statements.

  **Trace Actions or Actions**<br/>
  Trace statements that are executed whenever a probe "fires".

  **Action Methods**<br/>
  BTrace trace statements that are executed when a probe fires are defined inside a static method a class. Such methods are called "action" methods.   

## BTrace Program Structure

 A BTrace program is a plain Java class that has one or more `public static void` methods that are annotated with [BTrace annotations](#btrace-annotations). The annotations are used to specify traced program "locations" (also known as "probe points"). The tracing actions are specified inside the static method bodies. These static methods are referred as "action" methods. 

## BTrace Restrictions

 To guarantee that the tracing actions are "read-only" (i.e., the trace actions don't change the state of the program traced) and bounded (i.e., trace actions terminate in bounded time), a BTrace program is allowed to do only a restricted set of actions. In particular, a BTrace class 

* can **not** create new objects.

* can **not** create new arrays.

* can **not** throw exceptions.

* can **not** catch exceptions.

* can **not** make arbitrary instance or static method calls - only the **`public static`** methods of **[com.sun.btrace.BTraceUtils](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/BTraceUtils.html)** class may be called from a BTrace program.

* can **not** assign to static or instance fields of target program's classes and objects. But, BTrace class can assign to it's own static fields ("trace state" can be mutated).

* can **not** have instance fields and methods. Only **`static public void`** returning methods are allowed for a BTrace class. And all fields have to be static.

* can **not** have outer, inner, nested or local classes.

* can **not** have synchronized blocks or synchronized methods.

* can **not** have loops (**`for, while, do..while`**)

* can **not** extend arbitrary class (super class has to be java.lang.Object)

* can **not** implement interfaces.

* can **not** contains assert statements.

* can **not** use class literals.
  
  ## A simple BTrace program
  
  ```java
  // import all BTrace annotations
  import com.sun.btrace.annotations.*;
  // import statics from BTraceUtils class
  import static com.sun.btrace.BTraceUtils.*;
  // @BTrace annotation tells that this is a BTrace program
  @BTrace
  public class HelloWorld {
    // @OnMethod annotation tells where to probe.
    // In this example, we are interested in entry 
    // into the Thread.start() method. 
    @OnMethod(
        clazz="java.lang.Thread",
        method="start"
    )
    public static void func() {
        // println is defined in BTraceUtils
        // you can only call the static methods of BTraceUtils
        println("about to start a thread!");
    }
  }
  ```
  
  The above BTrace program can be run against a running Java process. This program will print "about to start a thread!" at the BTrace client whenever the target program is about to start a thread by `Thread.start()` method. There are other interesting probe points possible. For example, we can insert trace action at return from a method, exception return from a method, a field get or set within method(s), object/array creation, line number(s), throwing an exception. Please refer to the [@OnMethod and other annotations](#btrace-annotations) for details. 
  
  ## Steps to run BTrace
1. Find the process id of the target Java process that you want to trace. You can use **[jps](http://java.sun.com/javase/6/docs/technotes/tools/share/jps.html)** tool to find the pid.

2. Write a BTrace program - you may want to start modifying one of the **[samples](#btrace-samples)**.

3. Run **btrace** tool by the following command line: 
   
   ```
   btrace <pid> <btrace-script>
   ```
   
   ## BTrace Command Line
   
   BTrace is run using the command line tool **btrace** as shown below: 
   
   ```
   btrace [-I <include-path>] [-p <port>] [-cp <classpath>] <pid> <btrace-script> [<args>]
   ```
   
   where 
* `include-path` is a set of include directories that are searched for header files. BTrace includes a simple preprocess with support for \#define, \#include and conditional compilation. It is **not** like a complete C/C++ preprocessor - but a useful subset. See the sample "ThreadBean.java". If -I is not specified, BTrace skips the preprocessor invocation step.

* `port` is the port in which BTrace agent listens. This is optional argument.

* `classpath` is set of directories, jar files where BTrace searches for classes during compilation. Default is ".".

* `pid` is the process id of the traced Java program

* `btrace-script` is the trace program. If it is a ".java", then it is compiled before submission. Or else, it is assumed to be pre-compiled [i.e., it has to be a .class] and submitted.
  
  ### optional

* `port` is the server socket port at which BTrace agent listens for clients. Default is 2020\.

* `path` is the classpath used for compiling BTrace program. Default is ".".

* `args` is command line arguments passed to BTrace program. BTrace program can access these using the built-in functions "$" and "$length".
  
  ## Pre-compiling BTrace scripts
  
  It is possible to precompile BTrace program using **btracec** script. btracec is a javac-like program that takes a BTrace program and produces a .class file. 
  
  ```
  btracec [-I <include-path>] [-cp <classpath>] [-d <directory>] <one-or-more-BTrace-.java-files>
  ```
  
  where 

* `include-path` is a set of include directories that are searched for header files. BTrace includes a simple preprocess with support for \#define, \#include and conditional compilation. It is **not** like a complete C/C++ preprocessor - but a useful subset. See the sample "ThreadBean.java". If -I is not specified, BTrace skips the preprocessor invocation step.

* `classpath` is the classpath used for compiling BTrace program(s). Default is "."

* `directory` is the output directory where compiled .class files are stored. Default is ".".
  This script uses BTrace compiler class - rather than regular javac and therefore will validate your BTrace program at compile time [so that you can avoid BTrace verify error at runtime]. 
  
  ## Starting an application with BTrace agent
  
  So far, we saw how to trace a running Java program. It is also possible to start an application with BTrace agent in it. If you want to start tracing the application from the very "beginning", you may want to start the app with BTrace agent and specify a trace script along with it [i.e., BTrace agent is attach-on-demand loadable as well as pre-loadable agent] You can use the following command to start an app and specify BTrace script file. But, you need to [precompile your BTrace script](#pre-compiling-btrace-scripts) for this kind of usage. 
  
  ```
  java -javaagent:btrace-agent.jar=script=<pre-compiled-btrace-script> <MainClass> <AppArguments>
  ```
  
  When starting the application this way, the trace output goes to a file named \<btrace-class-file-name\>.btrace in the current directory. Also, you can avoid starting server for other remote BTrace clients by specifying `noServer=true` as an argument to the BTrace agent. 
  There is a convenient script called **btracer** to do the above: 
  
  ```
  btracer <pre-compiled-btrace.class> <application-main-class> <application-args>
  ```
  
  ## BTrace Annotations
  
  ### Method Annotations

* **[@com.sun.btrace.annotations.OnMethod](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/OnMethod.html)** annotation can be used to specify target class(es), target method(s) and "location(s)" within the method(s). An action method annotated by this annotation is called when the matching method(s) reaches specified the location. In `OnMethod` annotation, traced class name is specified by "clazz" property and traced method is specified by "method" property. "clazz" may be a fully qualified class name (like **`java.awt.Component`** or a regular expression specified within two forward slashes. Refer to the samples **[NewComponent.java](https://github.com/btraceio/btrace/tree/master/samples/NewComponent.java)** and **[ Classload.java](https://github.com/btraceio/btrace/tree/master/samples/Classload.java)**. The regular expression can match zero or more classes in which case all matching classes are instrumented. For example **`/java\\.awt\\..+/`** matches all classes in java.awt package. Also, method name can be a regular expression as well - matching zero or more methods. Refer to the sample **[MultiClass.java](https://github.com/btraceio/btrace/tree/master/samples/MultiClass.java)**. There is another way to abstractly specify traced class(es) and method(s). Traced classes and methods may be specified by annotation. For example, if the "clazz" attribute is specified as **`@javax.jws.WebService`** BTrace will instrument all classes that are annotated by the WebService annotation. Similarly, method level annotations may be used to specify methods abstractly. Refer to the sample **[WebServiceTracker.java](https://github.com/btraceio/btrace/tree/master/samples/WebServiceTracker.java)**. It is also possible to combine regular expressions with annotations - like **`@/com\\.acme\\..+/`** matches any class that is annotated by any annotation that matches the given regular expression. It is possible to match multiple classes by specifying super type. i.e., match all classes that are subtypes of a given super type. **`+java.lang.Runnable`** matches all classes implementing java.lang.Runnable interface. Refer to the sample **[SubtypeTracer.java](https://github.com/btraceio/btrace/tree/master/samples/SubtypeTracer.java)**.

* **[@com.sun.btrace.annotations.OnTimer](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/OnTimer.html)** annotation can be used to specify tracing actions that have to run periodically once every N milliseconds. Time period is specified as long "value" property of this annotation. Refer to the sample **[Histogram.java](https://github.com/btraceio/btrace/tree/master/samples/Histogram.java)**

* **[@com.sun.btrace.annotations.OnError](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/OnError.html)** annotation can be used to specify actions that are run whenever any exception is thrown by tracing actions of some other probe. BTrace method annotated by this annotation is called when any exception is thrown by any of the other BTrace action methods in the same BTrace class.

* **[@com.sun.btrace.annotations.OnExit](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/OnExit.html)** annotation can be used to specify actions that are run when BTrace code calls "exit(int)" built-in function to finish the tracing "session". Refer to the sample **[ProbeExit.java](https://github.com/btraceio/btrace/tree/master/samples/ProbeExit.java)**.

* **[@com.sun.btrace.annotations.OnEvent](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/OnEvent.html)** annotation is used to associate tracing methods with "external" events send by BTrace client. BTrace methods annotated by this annotation are called when BTrace client sends an "event". Client may send an event based on some form of user request to send (like pressing Ctrl-C or a GUI menu). String value may used as the name of the event. This way certain tracing actions can be executed whenever an external event "fires". As of now, the command line BTrace client sends "events" whenever use presses Ctrl-C (SIGINT). On SIGINT, a console menu is shown to send an event or exit the client [which is the default for SIGINT]. Refer to the sample **[HistoOnEvent.java](https://github.com/btraceio/btrace/tree/master/samples/HistoOnEvent.java)**

* **[@com.sun.btrace.annotations.OnLowMemory](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/OnLowMemory.html)** annotation can be used to trace memory threshold exceed event. See sample **[MemAlerter.java](https://github.com/btraceio/btrace/tree/master/samples/MemAlerter.java)**

* **[@com.sun.btrace.annotations.OnProbe](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/OnProbe.html)** annotation can be used to specify to avoid using implementation internal classes in BTrace scripts. `@OnProbe` probe specifications are mapped to one or more `@OnMethod` specifications by the BTrace VM agent. Currently, this mapping is done using a XML probe descriptor file [accessed by the BTrace agent]. Refer to the sample **[SocketTracker1.java](https://github.com/btraceio/btrace/tree/master/samples/SocketTracker1.java)** and associated probe descriptor file **[java.net.socket.xml](https://github.com/btraceio/btrace/tree/master/samples/java.net.socket.xml)**. When running this sample, this xml file needs to be copied in the directory where the target JVM runs (or fix probeDescPath option in btracer.bat to point to whereever the .xml file is).
  
  ### Argument Annotations

* [@com.sun.btrace.annotations.Self](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/Self.html) annotation can be used to mark an argument to hold **this** (or **self**) value. Refer to the samples [AWTEventTracer.java](https://github.com/btraceio/btrace/tree/master/samples/AWTEventTracer.java) or [AllCalls1.java](https://github.com/btraceio/btrace/tree/master/samples/AllCalls1.java)

* [@com.sun.btrace.annotations.Return](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/Return.html) annotation can be used to mark an argument to hold the return value. Refer to the sample [Classload.java](https://github.com/btraceio/btrace/tree/master/samples/Classload.java)

* [@com.sun.btrace.annotations.ProbeClassName (since 1.1)](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/ProbeClassName.html) annotation can be used to mark an argument to hold the probed class name value. Refer to the sample [AllMethods.java](https://github.com/btraceio/btrace/tree/master/samples/AllMethods.java)

* [@com.sun.btrace.annotations.ProbeMethodName (since 1.1)](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/ProbeMethodName.html) annotation can be used to mark an argument to hold the probed method name. Refer to the sample [WebServiceTracker.java](https://github.com/btraceio/btrace/tree/master/samples/WebServiceTracker.java)
  
  * since 1.2 it accepts boolean parameter **fqn** to get a fully qualified probed method name

* [@com.sun.btrace.annotations.Duration](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/Duration.html) annotation can be used to mark an argument to hold the duration of the method call in nanoseconds. The argument must be a long. Use with **Kind.RETURN** or **Kind.ERROR** locations.

* [@com.sun.btrace.annotations.TargetInstance (since 1.1)](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/TargetInstance.htm) annotation can be used to mark an argument to hold the called instance value. Refer to the sample [AllCalls2.java](https://github.com/btraceio/btrace/tree/master/samples/AllCalls2.java)

* [@com.sun.btrace.annotations.TargetMethodOrField (since 1.1)](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/TargetMethodOrField.html) can be used to mark an argument to hold the called method name. Refer to the samples [AllCalls1.java](https://github.com/btraceio/btrace/tree/master/samples/AllCalls1.java) or [AllCalls2.java](https://github.com/btraceio/btrace/tree/master/samples/AllCalls2.java)
  
  * since 1.2 it accepts boolean parameter **fqn** to get a fully qualified target method name
    
    #### Unannotated arguments
    
    The unannotated BTrace probe method arguments are used for the signature matching and therefore they must appear in the order they are defined in the traced method. However, they can be interleaved with any number of annotated arguments. If an argument of type \*AnyType[]\* is used it will "eat" all the rest of the arguments in they order. The exact meaning of the unannotated arguments depends on the **Location** used: 

* **Kind.ENTRY, Kind.RETURN**- the probed method arguments

* **Kind.THROW** - the thrown exception

* **Kind.ARRAY\_SET, Kind.ARRAY\_GET** - the array index

* **Kind.CATCH** - the caught exception

* **Kind.FIELD\_SET** - the field value

* **Kind.LINE** - the line number

* **Kind.NEW** - the class name

* **Kind.ERROR** - the thrown exception
  
  ### Field Annotations

* **[@com.sun.btrace.annotations.Export](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/Export.html)** annotation can be used with BTrace fields (static fields) to specify that the field has to be mapped to a jvmstat counter. Using this, a BTrace program can expose tracing counters to external jvmstat clients (such as jstat). Refer to the sample **[ThreadCounter.java](https://github.com/btraceio/btrace/tree/master/samples/ThreadCounter.java)**

* **[@com.sun.btrace.annotations.Property](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/Property.html)** annotation can be used to flag a specific (static) field as a MBean attribute. If a BTrace class has atleast one static field with `@Property` attribute, then a MBean is created and registered with platform MBean server. JMX clients such as VisualVM, jconsole can be used to view such BTrace MBeans. After attaching BTrace to the target program, you can attach VisualVM or jconsole to the same program and view the newly created BTrace MBean. With VisualVM and jconsole, you can use MBeans tab to view the BTrace domain and check out it's attributes. Refer to the samples **[ThreadCounterBean](https://github.com/btraceio/btrace/tree/master/samples/ThreadCounterBean.java)** and **[HistogramBean.java](https://github.com/btraceio/btrace/tree/master/samples/HistogramBean.java)**.

* **[@com.sun.btrace.annotations.TLS](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/TLS.html)** annotation can be used with BTrace fields (static fields) to specify that the field is a thread local field. Each Java thread gets a separate "copy" of the field. These thread local fields may be used by BTrace programs to identify whether we reached multiple probe actions from the same thread or not. Refer to the samples **[OnThrow.java](https://github.com/btraceio/btrace/tree/master/samples/OnThrow.java)** and **[WebServiceTracker.java](https://github.com/btraceio/btrace/tree/master/samples/WebServiceTracker.java)**
  
  ### Class Annotations

* **[@com.sun.btrace.annotations.DTrace](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/DTrace.html)** annotation can be used to associate a simple one-liner D-script (inlined in BTrace Java class) with the BTrace program. Refer to the sample **[DTraceInline.java](https://github.com/btraceio/btrace/tree/master/samples/DTraceInline.java)**.

* **[@com.sun.btrace.annotations.DTraceRef](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/DTraceRef.html)** annotation can be used to associate a D-script (stored in a separate file) with the BTrace program. Refer to the sample **[DTraceRefDemo.java](https://github.com/btraceio/btrace/tree/master/samples/DTraceRefDemo.java)**.

* **[@com.sun.btrace.annotations.BTrace](https://static.javadoc.io/com.sun.tools.btrace/btrace-client/1.2.3/com/sun/btrace/annotations/BTrace.html)** annotation must be used to designate a given Java class as a BTrace program. This annotation is enforced by the BTrace compiler as well as by the BTrace agent.
  
  ## DTrace Integration
  
  Solaris DTrace is a dynamic, safe tracing system for Solaris programs - both kernel and user land programs. Because of the obvious parallels b/w DTrace and BTrace, it is natural to expect integration b/w BTrace and DTrace. There are two ways in which BTrace is integrated with DTrace. 

* BTrace program can raise a DTrace probe - by calling `dtraceProbe` -- see `BTraceUtils` javadoc referred above. For this feature to work, you need to be running on **Solaris 10 or beyond**. For other platforms (Solaris 9 or below or any other OS), `dtraceProbe()` will be a no-op.

* BTrace program can associate a D-script with it-- by `@DTrace` annotation (if the D-script is a simple one liner) or by `@DTraceRef` if the D-script is longer and hence stored outside of the BTrace program. See DTrace integration samples in the BTrace samples section below. This feature works using the **[DTrace Java API](http://www.opensolaris.org/os/project/dtrace-chime/java_dtrace_api/)**. For this DTrace feature to work (o.e., being able to run associated D-script), you need to be running on **Solaris 11 build 35 or beyond**. You may want to check whether you have **/usr/share/lib/java/dtrace.jar** on your machine or not. `@DTrace` and `@DTraceRef` annotations are ignored on other platforms (Solaris 10 or below or any other OS).
  
  ## BTrace Samples
  
  **[BTrace samples](https://github.com/btraceio/btrace/tree/master/samples)** 
  One lines about samples: 

* [AWTEventTracer.java](https://github.com/btraceio/btrace/tree/master/samples/AWTEventTracer.java) - demonstates tracing of AWT events by instrumenting `EventQueue.dispatchEvent()` method. Can filter events by instanceof check. This sample filters and prints only focus events.

* [AllLines.java](https://github.com/btraceio/btrace/tree/master/samples/AllLines.java) - demonstates line number based BTrace probes. It is possible to probe into any class (or classes) and line number(s). When the specified line number(s) of specified class(es) is reached, the BTrace probe fires and the corresponding action is executed.

* [ArgArray.java](https://github.com/btraceio/btrace/tree/master/samples/ArgArray.java) - prints all input arguments in every `readXXX` method of every class in java.io package. Demonstrates argument array access and multiple class/method matching in probe specifications.

* [Classload.java](https://github.com/btraceio/btrace/tree/master/samples/Classload.java) - prints stack trace on every successful classload (`defineClass` returns) by any userdefined class loader.

* [CommandArg.java](https://github.com/btraceio/btrace/tree/master/samples/CommandArg.java) - demonstrates BTrace command line argument access.

* [Deadlock.java](https://github.com/btraceio/btrace/tree/master/samples/Deadlock.java) - demonstrates `@OnTimer` probe and `deadlock()` built-in function.

* [DTraceInline.java](https://github.com/btraceio/btrace/tree/master/samples/DTraceInline.java) - demonstrates `@DTrace` annotation to associate a simple one-line D-script with the BTrace program.

* [DTraceRefDemo.java](https://github.com/btraceio/btrace/tree/master/samples/DTraceRefDemo.java) - demonstrates `@DTraceRef` annotation to associate a D-script file with the BTrace program. This sample associates [classload.d](https://github.com/btraceio/btrace/tree/master/samples/classload.d) with itself.

* [FileTracker.java](https://github.com/btraceio/btrace/tree/master/samples/FileTracker.java) - prints file open for read/write by probing into `File{Input/Output}Stream` constructor entry points.

* [FinalizeTracker.java](https://github.com/btraceio/btrace/tree/master/samples/FinalizeTracker.java) - demonstrates that we can print all fields of an object and access (private) fields (read-only) as well. This is useful in debugging / troubleshooting scenarios. This sample prints info on `close() /finalize()` methods of `java.io.FileInputStream` class.

* [Histogram.java](https://github.com/btraceio/btrace/tree/master/samples/Histogram.java) - demonstates usage of BTrace maps for collecting histogram (of `javax.swing.JComponent` objects created by an app - histogram by subclass name and count).

* [HistogramBean.java](https://github.com/btraceio/btrace/tree/master/samples/HistogramBean.java) - demonstates JMX integration. This sample exposes a Map as MBean attribute using `@Property` annotation.

* [HistoOnEvent.java](https://github.com/btraceio/btrace/tree/master/samples/HistoOnEvent.java) - demonstrates getting trace output based on client side event. After starting the script by BTrace client, press Ctrl-C to get menu to send event or exit. On sending event, histogram is printed. This way client can "pull" trace output whenever needed rather than BTrace agent pushing the trace output always or based on timer.

* [JdbcQueries.java](https://github.com/btraceio/btrace/tree/master/samples/JdbcQueries.java) - demonstrates BTrace aggregation facility. This facility is similar to **[ DTrace aggregation](http://dlc.sun.com/osol/docs/content/DTRCUG/gcggh.html)** facility.

* [JInfo.java](https://github.com/btraceio/btrace/tree/master/samples/JInfo.java) - demonstrates `printVmArguments()`, `printProperties()` and `printEnv()` built-in functions.

* [JMap.java](https://github.com/btraceio/btrace/tree/master/samples/JMap.java) - demonstrates `dumpHeap()` built-in function to dump (hprof binary format) heap dump of the target application.

* [JStack.java](https://github.com/btraceio/btrace/tree/master/samples/JStack.java) - demonstrates `jstackAll()` built-in function to print stack traces of all the threads.

* [LogTracer.java](https://github.com/btraceio/btrace/tree/master/samples/LogTracer.java) - demonstrates trapping into an instance method (Logger.log) and printing private field value (of LogRecord object) by `field()` and `objectValue()` built-in functions.

* [MemAlerter.java](https://github.com/btraceio/btrace/tree/master/samples/MemAlerter.java) - demonstrates tracing low memory event by `@OnLowMememory` annotation.

* [Memory.java](https://github.com/btraceio/btrace/tree/master/samples/Memory.java) - prints memory stat once every 4 seconds by a timer probe. Demonstrates memory stat built-in functions.

* [MultiClass.java](https://github.com/btraceio/btrace/tree/master/samples/MultiClass.java) - demonstrates inserting trace code into multiple methods of multiple classes using regular expressions for `clazz` and `method` fields of `@OnMethod` annotation.

* [NewComponent.java](https://github.com/btraceio/btrace/tree/master/samples/NewComponent.java) - tracks every `java.awt.Component` creation and increments a counter and prints the counter based on a timer.

* [OnThrow.java](https://github.com/btraceio/btrace/tree/master/samples/OnThrow.java) - prints exception stack trace every time any exception instance is created. In most scenarios, exceptions are thrown immediately after creation. So, it we get stack trace of throw points.

* [ProbeExit.java](https://github.com/btraceio/btrace/tree/master/samples/ProbeExit.java) - demonstrates `@OnExit` probe and `exit(int)` built-in function.

* [Sizeof.java](https://github.com/btraceio/btrace/tree/master/samples/Sizeof.java) - demonstates "sizeof" built-in function that can be used to get (approx.) size of a given Java object. It is possible to get size-wise histogram etc. using this built-in.

* [SocketTracker.java](https://github.com/btraceio/btrace/tree/master/samples/SocketTracker.java) - prints every server socker creation/bind and client socket accepts.

* [SocketTracker1.java](https://github.com/btraceio/btrace/tree/master/samples/SocketTracker1.java) - similar to SocketTracker.java sample, except that this sample uses `@OnProbe` probes to avoid using Sun specific socket channel implementation classes in BTrace program. Instead `@OnProbe` probes are mapped to `@OnMethod` probes by BTrace agent.

* [SysProp.java](https://github.com/btraceio/btrace/tree/master/samples/SysProp.java) - demonstrates that it is okay to probe into System classes (like `java.lang.System`) and call BTrace built-in functions in the action method.

* [SubtypeTracer.java](https://github.com/btraceio/btrace/tree/master/samples/SubtypeTracer.java) - demonstrates that it is possible to match all subtypes of a given supertype.

* [ThreadCounter.java](https://github.com/btraceio/btrace/tree/master/samples/ThreadCounter.java) - demonstrates use of jvmstat counters from BTrace programs.

* [ThreadCounterBean.java](https://github.com/btraceio/btrace/tree/master/samples/ThreadCounterBean.java) - demonstrates exposing the BTrace program as a JMX bean with one attribute (using `@Property` annotation).

* [ThreadBean.java](https://github.com/btraceio/btrace/tree/master/samples/ThreadBean.java) - demonstrates the use of preprocessor of BTrace [and JMX integratio].

* [ThreadStart.java](https://github.com/btraceio/btrace/tree/master/samples/ThreadStart.java) - demonstrates raising DTrace probes from BTrace programs. See also [jthread.d](https://github.com/btraceio/btrace/tree/master/samples/jthread.d) - the associated D-script. This sample raises a DTrace USDT probe whenever the traced program enters `java.lang.Thread.start()` method. The BTrace program passes JavaThread's name to DTrace.

* [Timers.java](https://github.com/btraceio/btrace/tree/master/samples/Timers.java) - demonstrates multiple timer probes (`@OnTimer`) in a BTrace program.

* [URLTracker.java](https://github.com/btraceio/btrace/tree/master/samples/URLTracker.java) - prints URL every time `URL.openConnection` returns successfully. This program uses [jurls.d](https://github.com/btraceio/btrace/tree/master/samples/jurls.d) D-script as well (to show histogram of URLs opened via DTrace).

* [WebServiceTracker.java](https://github.com/btraceio/btrace/tree/master/samples/WebServiceTracker.java) - demonstates tracing classes and methods by specifying class and method level annotations rather than class and method names.
