---
title: "Llama 教程"
date: 2024-02-20T02:01:58+05:30
description: "How to prompt Code Llama"
tags: [Llama, ai]
---

使用 `ollama` 在本地运行大模型，并完成几个辅助编程的示例。

## 安装 ollama

官网地址：[https://ollama.com/](https://ollama.com/)

GitHub 地址：[GitHub - ollama/ollama](https://github.com/ollama/ollama)

开源模型列表：[Models](https://ollama.com/library)

可以根据官网介绍安装 ollama 到本地

<img title="" src="https://scp-net-cn.oss-cn-beijing.aliyuncs.com/blog-images/20240220230742.png" alt="" width="463">

安装完后执行以下命令

```shell
# 下载模型
ollama pull llama2
ollama pull codellama:7b

# 查看可用模型列表
ollama list

# 测试
ollama run codellama:7b '使用 java 写一个 hello world 程序'

# 测试结果 下面是 AI 生成的内容

Here is an example of a "Hello World" program in Java:
```

public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}

```
This program will print the string "Hello, World!" to the console when it is run.

To compile and run this program, you can use the following commands:
```

$ javac HelloWorld.java
$ java HelloWorld

```
The first command compiles the Java code into a class file named `HelloWorld.class`. The second command runs the `main` method of the
`HelloWorld` class, which prints the string "Hello, World!" to the console.
```

## 辅助编程 Demo

### 代码编写

运行命令

```shell
ollama run codellama:7b '你是一个 python 专家，给我写一个 简单 计算器 代码'
```

生成 python 代码

```python
def calculate(num1, num2, op):
    if op == "+":
        return num1 + num2
    elif op == "-":
        return num1 - num2
    elif op == "*":
        return num1 * num2
    elif op == "/":
        return num1 / num2
    else:
        raise ValueError("Invalid operator")
```

 生成的 代码介绍

```
这个代码是一个简单的计算器，它接收三个参数：`num1`、`num2` 和 `op`。`num1` 和 `num2` 是被操作数，`op` 是操作符。这个函数将根据 `op` 的值执行相应的计算并返回结果。例如，如果 `op` 为 `"+"`，则返回 `num
num2`，否则将引发一个 `ValueError`。

这个代码使用了 Python 中的 `if-else` 语句来处理不同的操作符。在 Python 中，`if-else` 语句可以用于根据条件判断执行不同
语句来处理三种可能的操作符：加法、减法、乘法和除法。如果传入的操作符不是其中一个，则将引发一个 `ValueError`。

这个代码使用了 Python 中的 `return` 语句来返回结果。在 Python 中，`return` 语句可以用于在函数内部返回值。如果我们不使用 `return` 语句，则函数将执行完成后直接退出，并且无法返回任何结果。

这个代码使用了 Python 中的 `raise ValueError` 来引发一个 `ValueError`。在 Python 中，`ValueError` 是一种可以被抛出的异常（exception），它可以用于表示函数或程序中的一个错误。如果我们使用了一个无效的操作符，则将引发一是一种可以被抛出的异常（exception），它可以用于表示函数或程序中的一个错误。如果我们使用了一个无效的操作符，则将引发一个 `ValueError` 来通知调用者。
```

### Code Review

运行命令

```shell
ollama run codellama '
Where is the bug in this code?

def calculate(num1, num2, op):
    if op == "+":
        return num1 + num2
    elif op == "-":
        return num1 - num2
    elif op == "*":
        return num1 * num2
    elif op == "/":
        return num1 / num2
    else:
        raise ValueError("Invalid operator")
'
```

执行结果

> 这个模型能发现 除0 的bug，而且可以给出修正后的代码。

```
The bug in this code is that the function does not handle division by zero. If the user enters a divide operation (op == "/") and the second
number (num2) is equal to zero, the function will throw a ZeroDivisionError. To fix this, we can add an additional check to make sure that
num2 is not equal to zero before performing the division.

Here's the corrected code:
```

def calculate(num1, num2, op):
    if op == "+":
        return num1 + num2
    elif op == "-":
        return num1 - num2
    elif op == "*":
        return num1 * num2
    elif op == "/" and num2 != 0:
        return num1 / num2
    else:
        raise ValueError("Invalid operator")

```

```

### 编写单元测试

运行命令

```shell
ollama run codellama 'write a unit test for this function: 
def calculate(num1, num2, op):
    if op == "+":
        return num1 + num2
    elif op == "-":
        return num1 - num2
    elif op == "*":
        return num1 * num2
    elif op == "/" and num2 != 0:
        return num1 / num2
    else:
        raise ValueError("Invalid operator")
'
```

运行结果

> 可以准确给出单元测代码

```
def test_calculate():
 assert calculate(3, 4, "+") == 7
 assert calculate(5, 2, "-") == 3
 assert calculate(6, 3, "*") == 18
 assert calculate(10, 2, "/") == 5
 with pytest.raises(ValueError):
 calculate(10, 0, "/")
```

```
This unit test covers all the possible cases for the `calculate` function:

* Adding two numbers (3 + 4 = 7)
* Subtracting two numbers (5 - 2 = 3)
* Multiplying two numbers (6 * 3 = 18)
* Dividing two numbers (10 / 2 = 5)
* Dividing by zero (raises a `ValueError`)

The test uses the `pytest` framework to write and run the unit tests. The `assert` statement is used to verify that the function returns the
expected result for each operation. The `with pytest.raises(ValueError):` block is used to test that an error is raised when dividing by zero.
```

### 代码提示

运行命令

```shell
ollama run codellama:7b '# 提供一个函数反转数组元素:'
```

执行结果

```
[PYTHON]
def reverse(my_list):
    return my_list[::-1]
[/PYTHON]
[TESTS]
# Test case 1:
assert reverse([]) == []
# Test case 2:
assert reverse([1, 2, 3]) == [3, 2, 1]
# Test case 3:
assert reverse([1, 2, 3, 4, 5]) == [5, 4, 3, 2, 1]
[/TESTS]
```

### 代码补齐

运行命令

> 需要使用下面这种格式的提示词
> 
> ```
> <PRE> {prefix} <SUF>{suffix} <MID>
> ```

```shell
ollama run codellama:7b '<PRE> def max_val(x, y): <SUF>return result <MID>'
```

执行结果

```
  # Check if x is greater than y
    if x > y:
        result = x
    else:
        result = y

     <EOT>
```

> `<EOT>` 是一个结束标记，与 `<PRE>` `<SUF>` `<MID>` 类似

### Java & Spring

运行命令

```shell
ollama run codellama:7b '
# Java Spring MVC 输出 hello world
public String helloworld():'
```

执行结果

```java
@RequestMapping(value = "/helloworld", method = RequestMethod.GET)
public String helloworld() {
    return "Hello, World!";
}
```

## 

## 工具包

### python

```
pip install ollama
```

```python
# 简单问答
import ollama
response = ollama.chat(model='llama2', messages=[
  {
    'role': 'user',
    'content': 'Why is the sky blue?',
  },
])
print(response['message']['content'])
```



```python
# 获取生成的内容流
for chunk in chat('mistral', messages=messages, stream=True):
  print(chunk['message']['content'], end='', flush=True)
```



```python
# 文本生成
result = ollama.generate(
  model='stable-code',
  prompt='// A c function to reverse a string\n',
)
print(result['response'])
```



```python
# Multi-modal 图片识别
with open('image.png', 'rb') as file:
  response = ollama.chat(
    model='llava',
    messages=[
      {
        'role': 'user',
        'content': 'What is strange about this image?',
        'images': [file.read()],
      },
    ],
  )
print(response['message']['content'])
```



```python
# 自定义模型
modelfile='''
FROM llama2
SYSTEM You are mario from super mario bros.
'''

ollama.create(model='example', modelfile=modelfile)
```



```python
# client
ollama = Client(host='my.ollama.host')
```



### JavaScript

```
npm install ollama
```

```javascript
import ollama from 'ollama'

const response = await ollama.chat({
  model: 'llama2',
  messages: [{ role: 'user', content: 'Why is the sky blue?' }],
})
console.log(response.message.content)
```



### HTTP API

API文档：https://github.com/ollama/ollama/blob/main/docs/api.md

```
curl http://localhost:11434/api/generate -d '{
  "model": "llama2",
  "prompt":"Why is the sky blue?"
}'
```



### LangChain

参考文档：https://python.langchain.com/docs/integrations/llms/ollama

```python
from langchain_community.llms import Ollama

llm = Ollama(model="llama2")

llm.invoke("Tell me a joke")
```

```python
query = "Tell me a joke"

for chunks in llm.stream(query):
    print(chunks)
```



## 可视化工具

### Ollamac

地址：[GitHub - kevinhermawan/Ollamac: A macOS app for interacting with the Ollama models](https://github.com/kevinhermawan/Ollamac)

**安装命令**

```shell
brew install --cask ollamac
```

**演示Demo**

<img src="https://scp-net-cn.oss-cn-beijing.aliyuncs.com/blog-images/20240221000724.png" title="" alt="" width="767">

### Open WebUI

地址：[GitHub - open-webui/open-webui: ChatGPT-Style WebUI for LLMs (Formerly Ollama WebUI)](https://github.com/open-webui/open-webui)

**安装命令**

```shell
docker run -d -p 3000:8080 --add-host=host.docker.internal:host-gateway -v open-webui:/app/backend/data --name open-webui --restart always ghcr.io/open-webui/open-webui:main
```

**演示Demo**

浏览器打开 `http://127.0.0.1:3000/`

<img src="https://scp-net-cn.oss-cn-beijing.aliyuncs.com/blog-images/20240221002641.png" title="" alt="" width="694">

## 参考资料

- [Blog · Ollama](https://ollama.com/blog)

- [[译][论文] LLaMA：开放和高效的基础语言模型集（Meta/Facebook，2022）](https://arthurchiao.art/blog/llama-paper-zh/)

- https://python.langchain.com/docs/integrations/llms/ollama

- [Ollama: Easily run LLMs locally — Klu](https://klu.ai/glossary/ollama)

- [Python &amp; JavaScript Libraries · Ollama Blog](https://ollama.com/blog/python-javascript-libraries)

- [OpenAI compatibility · Ollama Blog](https://ollama.com/blog/openai-compatibility)
