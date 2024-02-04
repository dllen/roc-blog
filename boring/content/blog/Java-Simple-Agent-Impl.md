---
title: "How to Write a Javaagent"
date: 2021-03-18T12:13:38+05:30
---

## 什么是Java Agent技术

Java Agent本质上可以理解为一个插件，该插件就是一个精心提供的Jar包，这个Jar包通过JVMTI（JVM Tool Interface）完成加载，最终借助[JPLISAgent](https://github.com/openjdk/jdk/blob/master/src/java.instrument/share/native/libinstrument/JPLISAgent.c)（Java Programming Language Instrumentation Services Agent）完成对目标代码的修改。

**Java agent的功能**

- 可以在加载Java文件之前做拦截把字节码做修改
- 可以在运行期将已经加载的类的字节码做变更
- ...........

使用场景

- APM 工具：如 Pinpoint、SkyWalking 等

- 动态调试和诊断：比较流行的 btrace、arthas 等

- 热部署：jrebel 

- 混沌工程：jvm-sandbox 等

![](https://scp-net-cn.oss-cn-beijing.aliyuncs.com/blog-images/java-agent-overview-min.png)

#### 实现Agent启动方法

Java Agent支持目标JVM启动时加载，也支持在目标JVM运行时加载，这两种不同的加载模式会使用不同的入口函数，如果需要在目标JVM启动的同时加载Agent，那么可以选择实现下面的方法：

```
[1] public static void premain(String agentArgs, Instrumentation inst);
[2] public static void premain(String agentArgs);
```

JVM将首先寻找[1]，如果没有发现[1]，再寻找[2]。如果希望在目标JVM运行时加载Agent，则需要实现下面的方法：

```
[1] public static void agentmain(String agentArgs, Instrumentation inst);
[2] public static void agentmain(String agentArgs);
```

这两组方法的第一个参数AgentArgs是随同 `–javaagent` 一起传入的程序参数，如果这个字符串代表了多个参数，就需要自己解析这些参数。inst是`Instrumentation`类型的对象，是JVM自动传入的，我们可以拿这个参数进行类增强等操作。

#### 指定Main-Class

Agent需要打包成一个jar包，在ManiFest属性中指定`Premain-Class`或者`Agent-Class`：

```
Premain-Class: class
Agent-Class: class
```

#### 挂载到目标JVM

将编写的Agent打成jar包后，就可以挂载到目标JVM上去了。如果选择在目标JVM启动时加载Agent，则可以使用`-javaagent:[=]`，具体的使用方法可以使用`Java -Help`来查看。

如果想要在运行时挂载Agent到目标JVM，就需要做一些额外的开发了。

``com.sun.tools.attach.VirtualMachine 这个类代表一个JVM抽象，可以通过这个类找到目标JVM，并且将Agent挂载到目标JVM上。

下面是使用`com.sun.tools.attach.VirtualMachine`进行动态挂载Agent的一般实现：

```java
    private void attachAgentToTargetJVM() throws Exception {
        List<VirtualMachineDescriptor> virtualMachineDescriptors = VirtualMachine.list();
        VirtualMachineDescriptor targetVM = null;
        for (VirtualMachineDescriptor descriptor : virtualMachineDescriptors) {
            if (descriptor.id().equals(configure.getPid())) {
                targetVM = descriptor;
                break;
            }
        }
        if (targetVM == null) {
            throw new IllegalArgumentException("could not find the target jvm by process id:" + configure.getPid());
        }
        VirtualMachine virtualMachine = null;
        try {
            virtualMachine = VirtualMachine.attach(targetVM);
            virtualMachine.loadAgent("{agent}", "{params}");
        } catch (Exception e) {
            if (virtualMachine != null) {
                virtualMachine.detach();
            }
        }
    }
```

首先通过指定的进程ID找到目标JVM，然后通过Attach挂载到目标JVM上，执行加载Agent操作。VirtualMachine的Attach方法就是用来将Agent挂载到目标JVM上去的，而Detach则是将Agent从目标JVM卸载。



**[Instrumentation (Java Platform SE 8 )](https://docs.oracle.com/javase/8/docs/api/java/lang/instrument/Instrumentation.html)** 类提供检测 Java 编程语言代码所需的服务。Instrumentation 是在方法中添加字节码，以收集工具使用的数据。由于更改纯粹是附加的，因此这些工具不会修改应用程序状态或行为。这种良性工具的示例包括监控代理、分析器、覆盖分析器和事件记录器。

- `addTransformer`: 添加一个类转换器
- `removeTransformer`: 删除一个类转换器
- `isRetransformClassesSupported`: 判断是否支持类的重新转换
- `retransformClasses`: 在类加载后，重新定义该类
- `isRedefineClassesSupported`: 判断是否支持重新定义类
- `redefineClasses`: 重新进行类的定义
- `isModifiableClass`: 确定一个类是否可以通过重新转换或重新定义来修改
- `getAllLoadedClasses`: 返回 JVM 当前加载的所有类的数组
- `getInitiatedClasses`: 返回 loader 为其初始加载器的所有类的数组。如果提供的加载器为空，则返回由引导类加载器启动的类
- ......



### premain 静态方式

> 大多数中间件/工具的使用方式
> 
> 使用方法：java -javaagent:xxx.jar MyApp

代码地址：[application-premain](https://gitee.com/dllen/dllen-demos/tree/master/application-premain)

编译和测试：

```shell
# 编译打包
mvn clean package
# 执行
java -javaagent:target/application-premain-jar-with-dependencies.jar  -cp target/application-premain-jar-with-dependencies.jar com.ks.test.app.MyApp

# 执行结果（方法执行前后添加代码）
=====start=====
Hello World!
=====end=====
=====start=====
Hello World!
=====end=====
```

#### 核心代码

`MyTransformer.java` 类是具体实现字节码植入的实现类

```java
import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.IllegalClassFormatException;
import java.security.ProtectionDomain;
import java.util.Objects;
import javassist.ClassPool;
import javassist.CtClass;
import javassist.CtMethod;

public class MyTransformer implements ClassFileTransformer {


    public byte[] transform(ClassLoader loader, String className, Class<?> classBeingRedefined, ProtectionDomain protectionDomain, byte[] classfileBuffer) throws IllegalClassFormatException {

        //跳过java自带方法
        if (className.startsWith("java") || className.startsWith("sun")) {
            return classfileBuffer;
        }

        //好像使用premain这个className是没问题的，但使用attach时className的.变成了/，所以如果是attach，那么这里需要替换
        className = className.replace("/", ".");

        //只处理MyApp类
        if (!className.endsWith("MyApp")) {
            return classfileBuffer;
        }
        //使用javassist类库对字节码修改
        try {
            ClassPool classPool = ClassPool.getDefault();
            CtClass ctClass = classPool.get(className);
            CtMethod[] declaredMethods = ctClass.getDeclaredMethods();

            for (CtMethod declaredMethod : declaredMethods) {
                //只处理printSth方法
                if (Objects.equals("printHello", declaredMethod.getName())) {
                    //在方法执行前插入打印语句
                    declaredMethod.insertBefore("System.out.println(\"=====start=====\");");
                    //在方法执行后插入打印语句
                    declaredMethod.insertAfter("System.out.println(\"=====end=====\");");

                    break;
                }
            }

            return ctClass.toBytecode();

        } catch (Exception e) {
            e.printStackTrace();
        }

        return classfileBuffer;
    }
}
```

`PremainMain.java` Java Agent内部约定的 `premain` 实现：

```java
import java.lang.instrument.Instrumentation;

public class PremainMain {

    /*
     * 注意，这个premain方法签名是Java Agent约定的，不要随意修改
     * @param agentArgs
     * @param instrumentation
     */
    public static void premain(String agentArgs, Instrumentation instrumentation) {
        instrumentation.addTransformer(new MyTransformer());
    }

    //PremainMain#premain的方法签名是Java Agent内部约定的，不能随意修改。

}
```

`resouces/META-INF/MANIFEST.MF`通过 `MANIFEST.MF` 文件找到 `premain` 的实现类

```java
Manifest-Version: 1.0
Created-By: dllen
Premain-Class: com.ks.test.app.PremainMain
```

> 注意：最后一行需要留一个空行

`MyApp.java` 测试应用

```java
import java.util.concurrent.TimeUnit;


public class MyApp {

    public static void main(String[] args) {
        while (true) {
            printHello();
        }
    }


    private static void printHello() {
        System.out.println("Hello World!");

        try {
            TimeUnit.SECONDS.sleep(5);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }
}
```

### attach 动态方式

> 混沌工程-故障注入，应用调试和诊断的实现方式

代码地址：[application-attach](https://gitee.com/dllen/dllen-demos/tree/master/application-attach)

编译和测试：

```shell
# 编译打包
mvn clean package

# 终端 1
java -cp target/application-premain-jar-with-dependencies.jar com.ks.test.app.MyApp

# 终端 2
# 使用 ps 找到 进程id
java -cp ./target/application-premain-jar-with-dependencies.jar com.ks.test.app.AttachMain ${pid} ./target/application-premain-jar-with-dependencies.jar
# attach success!


# 终端 1 结果

Hello World!
Hello World!
Hello World!
Hello World!
Hello World!
come in agentmain
clazz = com.ks.test.app.AttachAgent
clazz = com.ks.test.app.MyApp
=====start=====
Hello World!
=====end=====
=====start=====
Hello World!
=====end=====
```

#### 核心代码

`MyAttachTransformer.java` 代码植入类

```java
import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.IllegalClassFormatException;
import java.security.ProtectionDomain;
import java.util.Objects;
import javassist.ClassPool;
import javassist.CtClass;
import javassist.CtMethod;

public class MyAttachTransformer implements ClassFileTransformer {


    public byte[] transform(ClassLoader loader, String className, Class<?> classBeingRedefined, ProtectionDomain protectionDomain, byte[] classfileBuffer) throws IllegalClassFormatException {
        //跳过java自带方法
        if (className.startsWith("java") || className.startsWith("sun")) {
            return classfileBuffer;
        }

        //好像使用premain这个className是没问题的，但使用attach时className的.变成了/，所以如果是attach，那么这里需要替换
        className = className.replace("/", ".");

        //只处理MyApp类
        if (!className.endsWith("MyApp")) {
            return classfileBuffer;
        }

        try {
            ClassPool classPool = ClassPool.getDefault();
            CtClass ctClass = classPool.get(className);
            CtMethod[] declaredMethods = ctClass.getDeclaredMethods();

            for (CtMethod declaredMethod : declaredMethods) {
                //只处理printSth方法
                if (Objects.equals("printHello", declaredMethod.getName())) {
                    //在方法执行前插入打印语句
                    declaredMethod.insertBefore("System.out.println(\"=====start=====\");");
                    //在方法执行后插入打印语句
                    declaredMethod.insertAfter("System.out.println(\"=====end=====\");");

                    break;
                }
            }

            return ctClass.toBytecode();

        } catch (Exception e) {
            e.printStackTrace();
        }

        return classfileBuffer;
    }
}
```

`AttachAgent.java`实现 `agentmain` 方法

```java
import java.lang.instrument.Instrumentation;
import java.lang.instrument.UnmodifiableClassException;

public class AttachAgent {

    /*
     * 注意：agentmain的方法签名也是约定好的，不能随意修改
     *
     * 其实如果要支持premain和attach两种方式的话，可以把premain和agentmain两个方法写在一个类里，这里为了方便演示，写成了两个
     *
     * @param agentArgs
     * @param instrumentation
     */
    public static void agentmain(String agentArgs, Instrumentation instrumentation) {
        String targetClassPath = "com.ks.test.app.MyApp";

        System.out.println("come in agentmain");

        for (Class<?> clazz : instrumentation.getAllLoadedClasses()) {

            // 过滤掉不能修改的类
            if (!instrumentation.isModifiableClass(clazz)) {
                continue;
            }

            System.out.println("clazz = " + clazz.getName());

            // 只修改我们关心的类
            if (clazz.getName().equals(targetClassPath)) {
                // 最根本的目的还是把MyTransformer添加到instrumentation中
                instrumentation.addTransformer(new MyAttachTransformer(), true);
                try {
                    instrumentation.retransformClasses(clazz);
                } catch (UnmodifiableClassException e) {
                    e.printStackTrace();
                }

                return;
            }
        }
    }
}
```

`resouces/META-INF/MANIFEST.MF`通过 `MANIFEST.MF` 文件找到 `agentmain` 的实现类

```
Manifest-Version: 1.0
Created-By: dllen
Agent-Class: com.ks.test.app.AttachAgent
Can-Redefine-Classes: true
Can-Retransform-Classes: true
```

`AttachMain.java` 在运行时挂载Agent到目标JVM

```java
import com.sun.tools.attach.VirtualMachine;
import java.io.File;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLClassLoader;

public class AttachMain {

    /*
     * 加载 tools.jar
     *
     * @throws NoSuchMethodException
     * @throws MalformedURLException
     * @throws InvocationTargetException
     * @throws IllegalAccessException
     */
    private static void prepareAttach() throws NoSuchMethodException, MalformedURLException, InvocationTargetException, IllegalAccessException {
        String binPath = System.getProperty("sun.boot.library.path");
        // remove jre/bin, replace with lib
        String libPath = binPath.substring(0, binPath.length() - 7) + "lib";
        URLClassLoader loader = (URLClassLoader) AttachMain.class.getClassLoader();
        Method addURLMethod = URLClassLoader.class.getDeclaredMethod("addURL", URL.class);
        addURLMethod.setAccessible(true);
        File toolsJar = new File(libPath + "/tools.jar");
        if (!toolsJar.exists()) {
            throw new RuntimeException(toolsJar.getAbsolutePath() + " does not exist");
        }
        addURLMethod.invoke(loader, new File(libPath + "/tools.jar").toURI().toURL());
    }

    public static void main(String[] args) {

        String pid = args[0];
        String agentPath = args[1];

        File agentFile = new File(agentPath);

        if (!agentFile.exists()) {
            System.out.println("Agent not exist!");
            return;
        }

        try {

            prepareAttach();

            VirtualMachine virtualMachine = VirtualMachine.attach(pid);
            virtualMachine.loadAgent(agentFile.getAbsolutePath());

            virtualMachine.detach();

            System.out.println("attach success!");
        } catch (Exception e) {
            e.printStackTrace();
        }

        // attach ok
    }
}
```

> 需要传递2个参数
> 
>     目标Java进程ID
> 
>     Agent的路径

### 参考资料

- [java agent · GitBook](http://www.taoxuefeng.com/JAVA/jdk/agent.html)

- [JavaAgent使用及原理 | 个人网页](https://zhengw-tech.com/2023/05/27/java-agent/)

- [Java 动态调试技术原理及实践 - 美团技术团队](https://tech.meituan.com/2019/11/07/java-dynamic-debugging-technology.html)

- [javaagent使用指南 - rickiyang - 博客园](https://www.cnblogs.com/rickiyang/p/11368932.html)

- [第21讲：深入剖析：如何使用 Java Agent 技术对字节码进行修改 · 深入浅出Java虚拟机 · 看云](https://www.kancloud.cn/alex_wsc/javajvm/1844993)

- [谈谈Java Agent技术的实现-腾讯云开发者社区-腾讯云](https://cloud.tencent.com/developer/article/2161810)

- https://segmentfault.com/a/1190000039731381

- [手把手教你Java字节码Demo](https://veryjj.github.io/2021/01/01/%E6%89%8B%E6%8A%8A%E6%89%8B%E6%95%99%E4%BD%A0Java%E5%AD%97%E8%8A%82%E7%A0%81Demo/)

- [深入探索 Java 热部署](https://www.hollischuang.com/archives/592)

### 字节码操作库

- https://asm.ow2.io/

- [GitHub - cglib/cglib](https://github.com/cglib/cglib)

- https://www.javassist.org/

- [Byte Buddy - runtime code generation for the Java virtual machine](https://bytebuddy.net/#/)

### 开源项目

- [GitHub - alibaba/jvm-sandbox: Real - time non-invasive AOP framework container based on JVM](https://github.com/alibaba/jvm-sandbox)

- [GitHub - btraceio/btrace: BTrace - a safe, dynamic tracing tool for the Java platform](https://github.com/btraceio/btrace)

- [GitHub - alibaba/arthas: Alibaba Java Diagnostic Tool Arthas/Alibaba Java诊断利器Arthas](https://github.com/alibaba/arthas)

- [GitHub - pinpoint-apm/pinpoint: APM, (Application Performance Management) tool for large-scale distributed systems.](https://github.com/pinpoint-apm/pinpoint)

- [GitHub - apache/skywalking: APM, Application Performance Monitoring System](https://github.com/apache/skywalking)
