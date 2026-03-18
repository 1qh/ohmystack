import Foundation

extension String {
    public var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

public struct SearchResult: Codable, Identifiable, Sendable {
    public let tmdb_id: Double
    public let title: String
    public let overview: String
    public let poster_path: String?
    public let release_date: String?
    public let vote_average: Double

    public var id: Int {
        Int(tmdb_id)
    }
}

public typealias ProfileData = BlogProfile
public typealias Genre = MovieGenre
