import Foundation

public protocol ConvexClientProtocol: Sendable {
    func query<T: Decodable & Sendable>(_ name: String, args: [String: Any]) async throws -> T
    func mutation<T: Decodable & Sendable>(_ name: String, args: [String: Any]) async throws -> T
    func mutation(_ name: String, args: [String: Any]) async throws
    func action<T: Decodable & Sendable>(_ name: String, args: [String: Any]) async throws -> T
    func action(_ name: String, args: [String: Any]) async throws
}
