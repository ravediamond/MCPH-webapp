import { NextRequest, NextResponse } from "next/server";
import { getCrateMetadata } from "@/services/firebaseService";
import { getCrateContent } from "@/services/storageService";
import { auth } from "@/lib/firebaseAdmin";

// Define the type for params
type RouteParams = Promise<{ id: string }>;

/**
 * API endpoint to get the content of a crate
 */
export async function GET(
  req: NextRequest,
  { params }: { params: RouteParams },
) {
  try {
    // Properly await the params
    const { id } = await params;

    console.log(`[Content Route] Accessing content for crate ID: ${id}`);

    // Get crate metadata
    const crate = await getCrateMetadata(id);
    if (!crate) {
      console.log(`[Content Route] Crate not found with ID: ${id}`);
      return NextResponse.json({ error: "Crate not found" }, { status: 404 });
    }

    console.log(
      `[Content Route] Found crate: ${crate.title}, Owner: ${crate.ownerId}, Public: ${crate.shared.public}`,
    );

    // Check if crate has expired
    const now = new Date();
    const expirationDate = new Date(crate.createdAt);
    expirationDate.setDate(expirationDate.getDate() + crate.ttlDays);

    if (now > expirationDate) {
      console.log(
        `[Content Route] Crate expired. Created: ${crate.createdAt}, TTL: ${crate.ttlDays} days`,
      );
      return NextResponse.json(
        { error: "This crate has expired" },
        { status: 410 }, // Gone
      );
    }

    // Enhanced logging for debugging auth issues
    console.log(
      "[Content Route] Request headers:",
      Object.fromEntries([...req.headers.entries()]),
    );
    console.log(
      "[Content Route] All cookies:",
      Object.fromEntries(
        req.cookies
          .getAll()
          .map((c) => [c.name, c.value.substring(0, 5) + "..."]),
      ),
    );

    // Check authentication
    const authHeader = req.headers.get("authorization");
    console.log(`[Content Route] Auth header present: ${Boolean(authHeader)}`);

    // Extract cookies for session-based auth
    const cookies = req.cookies;
    const sessionCookie = cookies.get("session");
    console.log(
      `[Content Route] Session cookie present: ${Boolean(sessionCookie)}`,
    );

    let userId = "anonymous";
    let isAuthenticated = false;

    // Try token-based auth first from Authorization header
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        console.log(`[Content Route] Verifying token auth from header`);
        const decodedToken = await auth.verifyIdToken(token);
        userId = decodedToken.uid;
        isAuthenticated = true;
        console.log(
          `[Content Route] Auth header token verification successful. User ID: ${userId}`,
        );
      } catch (error) {
        console.warn(
          `[Content Route] Invalid authentication token in header:`,
          error,
        );
      }
    }

    // If header auth failed, try session cookie (this is our primary auth method)
    if (!isAuthenticated && sessionCookie && sessionCookie.value) {
      try {
        console.log(`[Content Route] Verifying session cookie`);
        const decodedToken = await auth.verifyIdToken(sessionCookie.value);
        userId = decodedToken.uid;
        isAuthenticated = true;
        console.log(
          `[Content Route] Session cookie auth successful. User ID: ${userId}`,
        );
      } catch (error) {
        console.warn(`[Content Route] Invalid session cookie:`, error);
      }
    }

    // If still not authenticated, fallback to anonymous
    if (!isAuthenticated) {
      console.log(`[Content Route] Using anonymous access as fallback`);
    }

    // Check access permissions
    const isOwner = crate.ownerId === userId;
    const isPublic = crate.shared.public;
    const isSharedWithUser =
      Array.isArray(crate.shared.sharedWith) &&
      crate.shared.sharedWith.includes(userId);

    console.log(
      `[Content Route] Access check - isOwner: ${isOwner}, isPublic: ${isPublic}, isSharedWithUser: ${isSharedWithUser}`,
    );
    console.log(
      `[Content Route] Current user ID: ${userId}, Crate owner ID: ${crate.ownerId}`,
    );

    // If the crate is public, password-protected, and the user is not the owner,
    // require a password to view.
    if (isPublic && crate.shared.passwordProtected && !isOwner) {
      console.log(
        `[Content Route] Crate is password protected and user is not owner`,
      );
      // For GET requests, we can't easily pass a password
      // So we'll just return a 401 and let the client redirect to a password entry form
      return NextResponse.json(
        {
          error: "Password required to view this crate",
          passwordRequired: true,
        },
        { status: 401 },
      );
    }

    if (!isOwner && !isPublic && !isSharedWithUser) {
      console.log(
        `[Content Route] Permission denied. Not owner, not public, not shared with user.`,
      );
      return NextResponse.json(
        { error: "You don't have permission to access this crate" },
        { status: 403 },
      );
    }

    // Get crate content based on its category
    const { buffer, crate: updatedCrate } = await getCrateContent(id);
    console.log(
      `[Content Route] Content retrieved successfully, size: ${buffer.length} bytes`,
    );

    // Determine content-type based on crate's mimeType
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": crate.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(crate.title)}"`,
      },
    });
  } catch (error) {
    console.error("[Content Route] Error retrieving crate content:", error);
    return NextResponse.json(
      { error: "Failed to retrieve crate content" },
      { status: 500 },
    );
  }
}
