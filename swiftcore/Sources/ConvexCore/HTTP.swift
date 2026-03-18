import Foundation

public func passwordAuth(
    email: String,
    password: String,
    flow: String,
    convexURL: String
) async throws -> String {
    guard let url = URL(string: "\(convexURL)/api/auth/signin") else {
        throw ConvexError.serverError("Invalid auth URL")
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let params: [String: String] = [
        "email": email,
        "password": password,
        "flow": flow,
    ]
    let body: [String: Any] = [
        "provider": "password",
        "params": params,
    ]

    let bodyData = try JSONSerialization.data(withJSONObject: body)
    request.httpBody = bodyData

    let (data, response) = try await URLSession.shared.data(for: request)

    #if !SKIP
    guard let httpResponse = response as? HTTPURLResponse else {
        throw ConvexError.serverError("Invalid response")
    }
    guard httpResponse.statusCode == 200 else {
        let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
        throw ConvexError.serverError("Auth failed: \(errorBody)")
    }

    #endif

    guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        throw ConvexError.decodingError("Invalid JSON response")
    }
    guard let token = json["token"] as? String else {
        throw ConvexError.decodingError("No token in response")
    }

    return token
}

public func startOAuth(
    convexURL: String,
    redirectTo: String = "dev.noboil://auth"
) async throws -> (redirect: String, verifier: String) {
    guard let url = URL(string: "\(convexURL)/api/auth/signin") else {
        throw ConvexError.serverError("Invalid auth URL")
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let params = ["redirectTo": redirectTo]
    let body: [String: Any] = ["provider": "google", "params": params]
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, _) = try await URLSession.shared.data(for: request)
    guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let redirect = json["redirect"] as? String,
          let verifier = json["verifier"] as? String else {
        throw ConvexError.decodingError("No redirect/verifier in response")
    }

    return (redirect, verifier)
}

public func finishOAuth(
    convexURL: String,
    code: String,
    verifier: String
) async throws -> String {
    guard let url = URL(string: "\(convexURL)/api/auth/signin") else {
        throw ConvexError.serverError("Invalid auth URL")
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let params: [String: String] = ["code": code]
    let body: [String: Any] = ["params": params, "verifier": verifier]
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, _) = try await URLSession.shared.data(for: request)
    guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let token = json["token"] as? String else {
        throw ConvexError.decodingError("No token in verification response")
    }

    return token
}

public func extractOAuthCode(from url: URL) throws -> String {
    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    if let items = components?.queryItems {
        for item in items where item.name == "code" {
            if let value = item.value {
                return value
            }
        }
    }
    throw ConvexError.serverError("No code in callback URL")
}

public func postFile(
    data: Data,
    contentType: String,
    uploadURL: String
) async throws -> String {
    guard let url = URL(string: uploadURL) else {
        throw ConvexError.serverError("Invalid upload URL")
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(contentType, forHTTPHeaderField: "Content-Type")
    request.httpBody = data

    let (responseData, response) = try await URLSession.shared.data(for: request)

    #if !SKIP
    guard let httpResponse = response as? HTTPURLResponse,
          httpResponse.statusCode == 200 else {
        throw ConvexError.serverError("File upload failed")
    }

    #endif

    guard let json = try JSONSerialization.jsonObject(with: responseData) as? [String: Any],
          let storageID = json["storageId"] as? String else {
        throw ConvexError.decodingError("No storageId in upload response")
    }

    return storageID
}

public func guessContentType(for url: URL) -> String {
    let ext = url.pathExtension.lowercased()
    switch ext {
    case "jpeg",
         "jpg":
        return "image/jpeg"

    case "png":
        return "image/png"

    case "gif":
        return "image/gif"

    case "webp":
        return "image/webp"

    case "pdf":
        return "application/pdf"

    case "mp4":
        return "video/mp4"

    case "mov":
        return "video/quicktime"

    default:
        return "application/octet-stream"
    }
}
