package com.typeprompt

fun getGreeting(): String {
    return "Hello, World!"
}

fun main() {
    println(getGreeting())
}

sealed interface MyInterface

sealed interface MyOtherInterface

data class Foo(val x: Int) : MyInterface

data class Bar(val x: Int) : MyInterface, MyOtherInterface

fun f(i: MyInterface): String {
    return when (i) {
        is Foo -> "foo"
        is Bar -> "bar"
    }
}

private object Internal
