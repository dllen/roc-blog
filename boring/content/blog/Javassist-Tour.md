---
title: "Javassist tutorial"
date: 2019-12-01T12:13:38+05:30
---

[GitHub - jboss-javassist/javassist: Java bytecode engineering toolkit](https://github.com/jboss-javassist/javassist)

- [tutorial](https://www.javassist.org/tutorial/tutorial.html)

- [tutorial2](https://www.javassist.org/tutorial/tutorial2.html)

- [tutorial3](https://www.javassist.org/tutorial/tutorial3.html)

[示例代码地址](https://gitee.com/dllen/dllen-demos/tree/master/javassist-tour)

### Java Bytecode

[Java字节码指令列表](https://en.wikipedia.org/wiki/Java_bytecode_instruction_listings)

示例：`Point.java`

```java
package com.ks.test.app;

public class Point {

    private int x;
    private int y;
    public String name;

    public Point(int x, int y) {
        this.x = x;
        this.y = y;
    }

    public int getX() {
        return x;
    }

    public void setX(int x) {
        this.x = x;
    }

    public int getY() {
        return y;
    }

    public void setY(int y) {
        this.y = y;
    }

    public void move(int x, int y){
        this.x = x;
        this.y = y;
    }
}
```

编译java文件并查看字节码

```shell
mvn clean compile

javap -c target.classes.com.ks.test.app.Point
```

Java 字节码

```java
public class com.ks.test.app.Point {
  public java.lang.String name;

  public com.ks.test.app.Point(int, int);
    Code:
       0: aload_0
       1: invokespecial #1                  // Method java/lang/Object."<init>":()V
       4: aload_0
       5: iload_1
       6: putfield      #2                  // Field x:I
       9: aload_0
      10: iload_2
      11: putfield      #3                  // Field y:I
      14: return

  public int getX();
    Code:
       0: aload_0
       1: getfield      #2                  // Field x:I
       4: ireturn

  public void setX(int);
    Code:
       0: aload_0
       1: iload_1
       2: putfield      #2                  // Field x:I
       5: return

  public int getY();
    Code:
       0: aload_0
       1: getfield      #3                  // Field y:I
       4: ireturn

  public void setY(int);
    Code:
       0: aload_0
       1: iload_1
       2: putfield      #3                  // Field y:I
       5: return

  public void move(int, int);
    Code:
       0: aload_0
       1: iload_1
       2: putfield      #2                  // Field x:I
       5: aload_0
       6: iload_2
       7: putfield      #3                  // Field y:I
      10: return
}
```

分析一下`move()`方法的字节码

- aload_0: 从局部变量0加载一个引用到堆栈上

- iload_1: 从局部变量1加载 int 值

- putfield：给对象赋值

- return：方法返回

Java代码都会编译成字节码，使用 *[Javasisst](http://jboss-javassist.github.io/javassist/)* 可以非常容易的修改字节码；

### Generating a Java Class

生产一个Java类

```java
import java.lang.reflect.Field;
import javassist.ClassPool;
import javassist.bytecode.AccessFlag;
import javassist.bytecode.ClassFile;
import javassist.bytecode.FieldInfo;

public class Demo1 {

    public static void main(String[] args) throws Exception {

        // 生产一个Demo类，并添加一个id字段
        ClassFile cf = new ClassFile(false, "com.ks.test.app.Demo", null);

        cf.setInterfaces(new String[]{"java.io.Serializable"});

        FieldInfo fieldInfo = new FieldInfo(cf.getConstPool(), "id", "I");
        fieldInfo.setAccessFlags(AccessFlag.PUBLIC);
        cf.addField(fieldInfo);

        ClassPool classPool = ClassPool.getDefault();

        Field[] fields = classPool.makeClass(cf).toClass().getFields();

        //
        System.out.println(fields[0].getName());
    }

}
```

### Loading Bytecode instructions of Class

获取Java Class 的字节码

```java
import javassist.ClassPool;
import javassist.bytecode.ClassFile;
import javassist.bytecode.CodeAttribute;
import javassist.bytecode.CodeIterator;
import javassist.bytecode.MethodInfo;
import javassist.bytecode.Mnemonic;

public class Demo2 {

    public static void main(String[] args) throws Exception {
        ClassPool classPool = ClassPool.getDefault();

        ClassFile classFile = classPool.get("com.ks.test.app.Point").getClassFile();

        MethodInfo methodInfo = classFile.getMethod("move");

        CodeAttribute codeAttribute = methodInfo.getCodeAttribute();

        CodeIterator codeIterator = codeAttribute.iterator();

        // 打印 move 方法的字节码
        System.out.println("start print move byte code....");
        System.out.println();
        while (codeIterator.hasNext()) {
            int index = codeIterator.next();
            int op = codeIterator.byteAt(index);
            System.out.println(Mnemonic.OPCODE[op]);
        }
        System.out.println();
        System.out.println("end print move byte code....");
    }

}
```

### Adding Fields to Existing Class Bytecode

给已有Java Class 添加字段

```java
import java.lang.reflect.Field;
import javassist.ClassPool;
import javassist.bytecode.AccessFlag;
import javassist.bytecode.ClassFile;
import javassist.bytecode.FieldInfo;

public class Demo3 {

    public static void main(String[] args) throws Exception {
        ClassPool classPool = ClassPool.getDefault();

        ClassFile classFile = classPool.get("com.ks.test.app.Point").getClassFile();
        // 给 Point 类添加一个id字段
        FieldInfo fieldInfo = new FieldInfo(classFile.getConstPool(), "id", "I");
        fieldInfo.setAccessFlags(AccessFlag.PUBLIC);

        classFile.addField(fieldInfo);

        // only get public fields
        Field[] fields = classPool.makeClass(classFile).toClass().getFields();

        for (Field field : fields) {
            System.out.println(field.getName());
        }
    }

}
```

### Adding Constructor to Class Bytecode

添加构造方法

```java
import javassist.ClassPool;
import javassist.bytecode.Bytecode;
import javassist.bytecode.ClassFile;
import javassist.bytecode.CodeIterator;
import javassist.bytecode.MethodInfo;
import javassist.bytecode.Mnemonic;

public class Demo4 {

    public static void main(String[] args) throws Exception {

        ClassPool classPool = ClassPool.getDefault();
        ClassFile classFile = classPool.get("com.ks.test.app.Point").getClassFile();

        Bytecode bytecode = new Bytecode(classFile.getConstPool());
        bytecode.addLload(0);
        bytecode.addInvokespecial("java/lang/Object", MethodInfo.nameInit, "()V");
        bytecode.addReturn(null);
        // addInvokespecial
        // 调用 java.lang.Object <init> 方法
        MethodInfo methodInfo = new MethodInfo(classFile.getConstPool(), MethodInfo.nameInit, "()V");
        methodInfo.setCodeAttribute(bytecode.toCodeAttribute());
        classFile.addMethod(methodInfo);

        CodeIterator codeIterator = bytecode.toCodeAttribute().iterator();
        // 打印字节码
        while (codeIterator.hasNext()) {
            int index = codeIterator.next();
            int op = codeIterator.byteAt(index);
            System.out.println(Mnemonic.OPCODE[op]);
        }
    }
}
```

### Hot load Java Class

运行时替换 Java Class，可以通过以下2种方式：

#### RedefineClassAgent

RedefineClassAgent 工具类，生成 jvm agent，并load agent，利用 `Instrumentation` `redefineClasses` 更新运行时类字节码信息；

以下为关键代码：

**创建和加载Agent**

```java
  /**
     * Lazy loads the agent that populates {@link #instrumentation}. OK to call multiple times.
     *
     * @throws FailedToLoadAgentException if agent either failed to load or if the agent wasn't able to get an
     *                                    instance of {@link Instrumentation} that allows class redefinitions.
     */
    private static void ensureAgentLoaded() throws FailedToLoadAgentException {
        if (instrumentation != null) {
            // already loaded
            return;
        }

        // load the agent
        try {
            File agentJar = createAgentJarFile();

            // Loading an agent requires the PID of the JVM to load the agent to. Find out our PID.
            String nameOfRunningVM = ManagementFactory.getRuntimeMXBean().getName();
            String pid = nameOfRunningVM.substring(0, nameOfRunningVM.indexOf('@'));

            // load the agent
            VirtualMachine vm = VirtualMachine.attach(pid);
            vm.loadAgent(agentJar.getAbsolutePath(), "");
            vm.detach();
        } catch (Exception e) {
            throw new FailedToLoadAgentException(e);
        }

        // wait for the agent to load
        for (int sec = 0; sec < AGENT_LOAD_WAIT_TIME_SEC; sec++) {
            if (instrumentation != null) {
                // success!
                return;
            }

            try {
                LOGGER.info("Sleeping for 1 second while waiting for agent to load.");
                Thread.sleep(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new FailedToLoadAgentException();
            }
        }

        // agent didn't load
        throw new FailedToLoadAgentException();
    }

    /**
     * An agent must be specified as a .jar where the manifest has an Agent-Class attribute. Additionally, in order
     * to be able to redefine classes, the Can-Redefine-Classes attribute must be true.
     *
     * This method creates such an agent Jar as a temporary file. The Agent-Class is this class. If the returned Jar
     * is loaded as an agent then {@link #agentmain(String, Instrumentation)} will be called by the JVM.
     *
     * @return a temporary {@link File} that points at Jar that packages this class.
     * @throws IOException if agent Jar creation failed.
     */
    private static File createAgentJarFile() throws IOException {
        File jarFile = File.createTempFile("agent", ".jar");
        jarFile.deleteOnExit();

        // construct a manifest that allows class redefinition
        Manifest manifest = new Manifest();
        Attributes mainAttributes = manifest.getMainAttributes();
        mainAttributes.put(Attributes.Name.MANIFEST_VERSION, "1.0");
        mainAttributes.put(new Attributes.Name("Agent-Class"), RedefineClassAgent.class.getName());
        mainAttributes.put(new Attributes.Name("Can-Retransform-Classes"), "true");
        mainAttributes.put(new Attributes.Name("Can-Redefine-Classes"), "true");

        try (JarOutputStream jos = new JarOutputStream(new FileOutputStream(jarFile), manifest)) {
            // add the agent .class into the .jar
            JarEntry agent = new JarEntry(RedefineClassAgent.class.getName().replace('.', '/') + ".class");
            jos.putNextEntry(agent);

            // dump the class bytecode into the entry
            ClassPool pool = ClassPool.getDefault();
            CtClass ctClass = pool.get(RedefineClassAgent.class.getName());
            jos.write(ctClass.toBytecode());
            jos.closeEntry();
        } catch (CannotCompileException | NotFoundException e) {
            // Realistically this should never happen.
            LOGGER.log(Level.SEVERE, "Exception while creating RedefineClassAgent jar.", e);
            throw new IOException(e);
        }

        return jarFile;
    }
```

**运行时更新类字节码**

```java
    /**
     * Attempts to redefine class bytecode.
     * <p>
     * On first call this method will attempt to load an agent into the JVM to obtain an instance of
     * {@link Instrumentation}. This agent load can introduce a pause (in practice 1 to 2 seconds).
     *
     * @see Instrumentation#redefineClasses(ClassDefinition...)
     *
     * @param definitions classes to redefine.
     * @throws UnmodifiableClassException as thrown by {@link Instrumentation#redefineClasses(ClassDefinition...)}
     * @throws ClassNotFoundException as thrown by {@link Instrumentation#redefineClasses(ClassDefinition...)}
     * @throws FailedToLoadAgentException if agent either failed to load or if the agent wasn't able to get an
     *                                    instance of {@link Instrumentation} that allows class redefinitions.
     */
    public static void redefineClasses(ClassDefinition... definitions) throws UnmodifiableClassException, ClassNotFoundException, FailedToLoadAgentException {
        ensureAgentLoaded();
        instrumentation.redefineClasses(definitions);
    }
```

**测试代码**

```java
import java.lang.instrument.ClassDefinition;
import javassist.ClassPool;
import javassist.CtClass;
import javassist.CtMethod;

public class Demo5 {

    public static void main(String[] args) throws Exception {

        ClassPool classPool = ClassPool.getDefault();

        CtClass ctClass = classPool.get("com.ks.test.app.Point");

        ctClass.stopPruning(true);
        // javaassist freezes methods if their bytecode is saved
        // defrost so we can still make changes.
        if (ctClass.isFrozen()) {
            ctClass.defrost();
        }

        CtMethod ctMethod = ctClass.getDeclaredMethod("move");
        ctMethod.insertBefore("{ System.out.println(\"Wheeeeee!\"); }");
        byte[] bytecode = ctClass.toBytecode();

        ClassDefinition definition = new ClassDefinition(Class.forName("com.ks.test.app.Point"), bytecode);
        RedefineClassAgent.redefineClasses(definition);

        Point point = new Point(1, 1);
        point.move(1, 2);
    }
}
```

#### HotSwapper

使用 javassist HotSwapper 工具，该工具依赖 [JDWP](https://docs.oracle.com/javase/8/docs/technotes/guides/troubleshoot/introclientissues005.html)；

> JDWP: Provides the implementation of the Java Debug Wire Protocol (JDWP) agent.
> 
> 使用方法：`java -Xdebug -Xrunjdwp:transport=dt_socket,address=8888,server=y,suspend=y Test`
> 
> 参考文档：
> 
> - [Java Application Remote Debugging | Baeldung](https://www.baeldung.com/java-application-remote-debugging)
> 
> - [JDWP Structure Overview](https://docs.oracle.com/en/java/javase/12/docs/specs/jpda/architecture.html)
> 
> - [Remote Debugging Java Applications With JDWP | Learning Quest](https://mahmoudanouti.wordpress.com/2019/07/07/remote-debugging-java-applications-with-jdwp/)

测试代码：

```java
import javassist.ClassPool;
import javassist.CtClass;
import javassist.CtMethod;
import javassist.util.HotSwapper;

public class Demo6 {

    //执行命令
    //java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=10240 Demo6
    public static void main(String[] args) throws Exception {
        HotSwapper hs = new HotSwapper(10240);
        new Hello().print();

        ClassPool classPool = ClassPool.getDefault();

        byte[] originBytes = classPool.get("com.ks.test.app.Hello").toBytecode();
        System.out.println("** reload a v2 version");

        CtClass ctClass = classPool.get("com.ks.test.app.Hello");
        ctClass.stopPruning(true);
        if(ctClass.isFrozen()){
            ctClass.defrost();
        }
        CtMethod ctMethod = ctClass.getDeclaredMethod("print");
        ctMethod.insertBefore("{System.out.println(\"** HelloWorld.print()\");}");
        hs.reload("com.ks.test.app.Hello", ctClass.toBytecode());

        new Hello().print();

        System.out.println("** reload the original version");

        hs.reload("com.ks.test.app.Hello", originBytes);
        new Hello().print();
    }

}
```

测试命令：

```
mvn clean package

java -cp "$JAVA_HOME/lib/*:target/javassit-tour-jar-with-dependencies.jar" -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=10240 com.ks.test.app.Demo6
```

> 注意：需要把 jdk 目录里 lib 下 jar 加载到 classpath 

运行结果：

```
Listening for transport dt_socket at address: 10240
hello world
** reload a v2 version
** HelloWorld.print()
hello world
** reload the original version
hello world
```
