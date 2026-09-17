// swift-tools-version: 6.2
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "TypePromptE2E",
    platforms: [
        .macOS(.v13),
    ],
    products: [
        // Products define the executables and libraries a package produces, making them visible to other packages.
        .library(
            name: "TypePromptE2E",
            targets: ["TypePromptE2E"]
        ),
    ],
    dependencies: [
        .package(url: "https://github.com/jpsim/Yams.git", from: "5.0.0"),
        .package(url: "https://github.com/toon-format/toon-swift.git", from: "0.3.0"),
    ],
    targets: [
        // Targets are the basic building blocks of a package, defining a module or a test suite.
        // Targets can depend on other targets in this package and products from dependencies.
        .target(
            name: "TypePromptE2E",
            dependencies: [
                .product(name: "Yams", package: "Yams"),
                .product(name: "ToonFormat", package: "toon-swift"),
            ]
        ),
        .testTarget(
            name: "TypePromptE2ETests",
            dependencies: ["TypePromptE2E"]
        ),
    ]
)
