// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "desktop-shared",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "DesktopShared", targets: ["DesktopShared"]),
    ],
    dependencies: [
        .package(path: "../../../swiftcore"),
    ],
    targets: [
        .target(name: "DesktopShared", dependencies: [
            .product(name: "ConvexCore", package: "swiftcore"),
        ]),
        .testTarget(name: "DesktopSharedTests", dependencies: ["DesktopShared"]),
    ]
)
