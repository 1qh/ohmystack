@testable import ConvexCore
import Foundation
import Testing

struct ModelsTests {
    @Test
    func movieDecodesFromJSON() throws {
        let json = """
        {
            "tmdb_id": 27205,
            "title": "Inception",
            "original_title": "Inception",
            "overview": "A thief who steals corporate secrets",
            "poster_path": "/poster.jpg",
            "release_date": "2010-07-16",
            "vote_average": 8.4,
            "vote_count": 30000,
            "genres": [{"id": 28, "name": "Action"}]
        }
        """
        let movie = try JSONDecoder().decode(Movie.self, from: Data(json.utf8))
        #expect(movie.title == "Inception")
        #expect(movie.tmdb_id == 27_205)
        #expect(movie.id == "")
        #expect(movie.genres.count == 1)
    }

    @Test
    func searchResultDecodesFromJSON() throws {
        let json = """
        {
            "tmdb_id": 123,
            "title": "Test",
            "overview": "Overview",
            "poster_path": null,
            "release_date": "2024-01-01",
            "vote_average": 7.5
        }
        """
        let result = try JSONDecoder().decode(SearchResult.self, from: Data(json.utf8))
        #expect(result.title == "Test")
        #expect(result.id == 123)
    }

    @Test
    func blogDecodesWithOptionalFields() throws {
        let json = """
        {
            "_id": "abc",
            "_creationTime": 1700000000000,
            "title": "Blog Title",
            "content": "Content",
            "category": "tech",
            "published": true,
            "coverImage": null,
            "coverImageUrl": null,
            "tags": ["swift"],
            "attachments": null,
            "attachmentsUrls": null,
            "attachmentsUrl": null,
            "userId": "user1",
            "updatedAt": 1700000000000,
            "author": {"name": "Alice", "email": null, "imageUrl": null}
        }
        """
        let blog = try JSONDecoder().decode(Blog.self, from: Data(json.utf8))
        #expect(blog.id == "abc")
        #expect(blog.title == "Blog Title")
        #expect(blog.tags?.count == 1)
    }

    @Test
    func chatDecodesFromJSON() throws {
        let json = """
        {
            "_id": "c1",
            "_creationTime": 1700000000000,
            "title": "Chat Room",
            "isPublic": true,
            "userId": "u1",
            "updatedAt": 1700000000000,
            "author": null
        }
        """
        let chat = try JSONDecoder().decode(Chat.self, from: Data(json.utf8))
        #expect(chat.id == "c1")
        #expect(chat.isPublic == true)
    }

    @Test
    func messageDecodesWithParts() throws {
        let json = """
        {
            "_id": "m1",
            "_creationTime": 1700000000000,
            "chatId": "c1",
            "parts": [{"type": "text", "text": "Hello", "image": null, "file": null, "name": null}],
            "role": "user",
            "userId": "u1",
            "updatedAt": null
        }
        """
        let message = try JSONDecoder().decode(Message.self, from: Data(json.utf8))
        #expect(message.parts.count == 1)
        #expect(message.parts[0].type == .text)
    }

    @Test
    func orgDecodesFromJSON() throws {
        let json = """
        {
            "_id": "o1",
            "_creationTime": 1700000000000,
            "name": "Acme",
            "slug": "acme",
            "userId": "u1",
            "updatedAt": 1700000000000
        }
        """
        let org = try JSONDecoder().decode(Org.self, from: Data(json.utf8))
        #expect(org.name == "Acme")
        #expect(org.slug == "acme")
    }

    @Test
    func paginatedResultDecodes() throws {
        let json = """
        {
            "page": [{"_id": "o1", "_creationTime": 0, "name": "Acme", "slug": "acme", "userId": "u1", "updatedAt": 0}],
            "continueCursor": "cursor123",
            "isDone": false
        }
        """
        let result = try JSONDecoder().decode(PaginatedResult<Org>.self, from: Data(json.utf8))
        #expect(result.page.count == 1)
        #expect(result.continueCursor == "cursor123")
        #expect(result.isDone == false)
    }

    @Test
    func taskItemDecodes() throws {
        let json = """
        {
            "_id": "t1",
            "_creationTime": 0,
            "title": "Fix bug",
            "projectId": "p1",
            "orgId": "o1",
            "priority": "high",
            "completed": false,
            "assigneeId": null,
            "userId": "u1",
            "updatedAt": 0
        }
        """
        let task = try JSONDecoder().decode(TaskItem.self, from: Data(json.utf8))
        #expect(task.title == "Fix bug")
        #expect(task.priority == .high)
        #expect(task.completed == false)
    }

    @Test
    func wikiDecodes() throws {
        let json = """
        {
            "_id": "w1",
            "_creationTime": 0,
            "title": "Wiki Page",
            "slug": "wiki-page",
            "content": "Content here",
            "orgId": "o1",
            "status": "draft",
            "editors": ["u1", "u2"],
            "deletedAt": null,
            "userId": "u1",
            "updatedAt": 0
        }
        """
        let wiki = try JSONDecoder().decode(Wiki.self, from: Data(json.utf8))
        #expect(wiki.slug == "wiki-page")
        #expect(wiki.editors?.count == 2)
    }
}

struct ErrorTests {
    @Test
    func convexErrorCases() {
        let e1 = ConvexError.decodingError("bad json")
        let e2 = ConvexError.notInitialized
        let e3 = ConvexError.serverError("500")
        #expect(String(describing: e1).contains("decodingError"))
        #expect(String(describing: e2).contains("notInitialized"))
        #expect(String(describing: e3).contains("serverError"))
    }

    @Test
    func urlConstantsAreLocalhost() {
        #expect(convexBaseURL.contains("127.0.0.1"))
        #expect(convexSiteURL.contains("127.0.0.1"))
    }
}

struct HTTPTests {
    @Test
    func extractOAuthCodeFromValidURL() throws {
        let url = try #require(URL(string: "dev.noboil://auth?code=abc123&state=xyz"))
        let code = try extractOAuthCode(from: url)
        #expect(code == "abc123")
    }

    @Test
    func extractOAuthCodeThrowsWhenMissing() throws {
        let url = try #require(URL(string: "dev.noboil://auth?state=xyz"))
        #expect(throws: ConvexError.self) {
            try extractOAuthCode(from: url)
        }
    }

    @Test
    func guessContentTypeForImages() {
        #expect(guessContentType(for: URL(fileURLWithPath: "/photo.jpg")) == "image/jpeg")
        #expect(guessContentType(for: URL(fileURLWithPath: "/photo.jpeg")) == "image/jpeg")
        #expect(guessContentType(for: URL(fileURLWithPath: "/photo.png")) == "image/png")
        #expect(guessContentType(for: URL(fileURLWithPath: "/photo.gif")) == "image/gif")
        #expect(guessContentType(for: URL(fileURLWithPath: "/photo.webp")) == "image/webp")
    }

    @Test
    func guessContentTypeForDocuments() {
        #expect(guessContentType(for: URL(fileURLWithPath: "/doc.pdf")) == "application/pdf")
        #expect(guessContentType(for: URL(fileURLWithPath: "/video.mp4")) == "video/mp4")
        #expect(guessContentType(for: URL(fileURLWithPath: "/video.mov")) == "video/quicktime")
    }

    @Test
    func guessContentTypeDefaultsToOctetStream() {
        #expect(guessContentType(for: URL(fileURLWithPath: "/file.xyz")) == "application/octet-stream")
    }
}

struct FormatTests {
    @Test
    func formatTimestampReturnsNonEmpty() {
        let result = formatTimestamp(1_700_000_000_000)
        #expect(result.isEmpty == false)
    }

    @Test
    func formatTimestampHandlesZero() {
        let result = formatTimestamp(0)
        #expect(result.isEmpty == false)
    }
}
