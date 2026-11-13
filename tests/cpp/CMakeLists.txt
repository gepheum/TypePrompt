cmake_minimum_required(VERSION 3.20)
project(typeprompt_cc_tests CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(MSVC)
  add_compile_options(/W4 /WX)
else()
  add_compile_options(-Wall -Wextra -Wno-unused-parameter -Werror)
endif()

add_library(runtime_logic INTERFACE)
target_include_directories(runtime_logic INTERFACE ${CMAKE_CURRENT_SOURCE_DIR})

add_executable(runtime_logic_test runtime_logic_test.cc)
target_link_libraries(runtime_logic_test PRIVATE runtime_logic)

enable_testing()
add_test(NAME runtime_logic_test COMMAND runtime_logic_test)
