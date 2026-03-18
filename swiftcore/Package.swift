// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "swift-core",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "ConvexCore", targets: ["ConvexCore"]),
    ],
    targets: [
        .target(name: "ConvexCore", swiftSettings: [.define("DESKTOP")]),
        .testTarget(name: "ConvexCoreTests", dependencies: ["ConvexCore"]),
    ]
)
