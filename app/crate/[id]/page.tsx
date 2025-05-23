"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  FaFileDownload,
  FaFile,
  FaClock,
  FaCalendarAlt,
  FaExclamationTriangle,
  FaCheck,
  FaShareAlt,
  FaUpload,
  FaFileAlt,
  FaFileImage,
  FaFilePdf,
  FaProjectDiagram,
  FaArrowLeft,
  FaFileCode,
  FaChartBar,
  FaUsers,
  FaDownload,
  FaEye,
  FaHistory,
  FaInfoCircle,
  FaServer,
  FaExternalLinkAlt,
  FaDatabase,
  FaLock,
} from "react-icons/fa";
import dynamic from "next/dynamic";
import Image from "next/image";
import Card from "../../../components/ui/Card";
import StatsCard from "../../../components/ui/StatsCard";

// Dynamic imports for markdown and code rendering
const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });
const SyntaxHighlighter = dynamic(() => import("react-syntax-highlighter"), {
  ssr: false,
});

// Dynamic import for mermaid diagram rendering
const MermaidDiagram = dynamic(
  () =>
    import("@lightenna/react-mermaid-diagram").then(
      (mod) => mod.MermaidDiagram,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="py-4 text-center text-gray-500 text-sm">
        Loading diagram...
      </div>
    ),
  },
);

interface FileMetadata {
  id: string;
  fileName: string;
  title: string;
  description?: string;
  contentType: string;
  size: number;
  uploadedAt: string | number | Date;
  expiresAt?: string | number | Date;
  downloadCount: number;
  viewCount?: number;
  userId?: string;
  compressed?: boolean;
  originalSize?: number;
  compressionRatio?: number;
  accessHistory?: {
    date: string;
    count: number;
  }[];
  metadata?: Record<string, string>;
  isShared?: boolean;
  password?: string;
  fileType?: string; // Optional: type of crate (generic, data, image, etc.)
}

export default function CratePage() {
  const params = useParams();
  const fileId = params?.id as string;

  const [fileInfo, setFileInfo] = useState<FileMetadata | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);
  const [isMermaidDiagram, setIsMermaidDiagram] = useState(false);
  const [accessStats, setAccessStats] = useState({
    today: 0,
    week: 0,
    month: 0,
  });
  const [showResetExpiry, setShowResetExpiry] = useState(false);
  const [newExpiryDate, setNewExpiryDate] = useState<string>("");
  const [resetExpiryLoading, setResetExpiryLoading] = useState(false);
  const [resetExpiryError, setResetExpiryError] = useState<string | null>(null);
  const [resetExpirySuccess, setResetExpirySuccess] = useState<string | null>(
    null,
  );
  const [expiryUnit, setExpiryUnit] = useState<"days" | "hours">("days");
  const [expiryAmount, setExpiryAmount] = useState<number>(1);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Memoized helpers
  const isTextFile = useCallback((contentType: string) => {
    return (
      contentType.includes("text") ||
      contentType.includes("markdown") ||
      contentType.includes("json") ||
      contentType.includes("javascript") ||
      contentType.includes("typescript") ||
      contentType.includes("css") ||
      contentType.includes("html") ||
      contentType.includes("xml")
    );
  }, []);
  const isImageFile = useCallback(
    (contentType: string) => contentType.includes("image"),
    [],
  );
  const isPdfFile = useCallback(
    (contentType: string) => contentType.includes("pdf"),
    [],
  );
  const checkIfMermaidDiagram = useCallback((content: string): boolean => {
    const mermaidPatterns = [
      /^\s*graph\s+(TB|TD|BT|RL|LR)/,
      /^\s*sequenceDiagram/,
      /^\s*classDiagram/,
      /^\s*stateDiagram/,
      /^\s*erDiagram/,
      /^\s*gantt/,
      /^\s*pie/,
      /^\s*flowchart/,
      /^\s*journey/,
    ];
    return mermaidPatterns.some((pattern) => pattern.test(content.trim()));
  }, []);

  // Fetch file metadata only when fileId changes
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    async function fetchFileMetadata() {
      setLoading(true);
      setError(null);
      setFileInfo(null);
      setFileContent(null);
      setIsMermaidDiagram(false);
      try {
        const response = await fetch(`/api/files/${fileId}`);
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "File not found or has expired"
              : "Failed to fetch file information",
          );
        }
        const data = await response.json();
        data.viewCount = (data.viewCount || 0) + 1;
        setFileInfo(data);
        if (data.expiresAt) {
          updateTimeRemaining(data.expiresAt);
          timer = setInterval(() => updateTimeRemaining(data.expiresAt), 60000);
        }
        if (data.accessHistory) {
          calculateAccessStats(data.accessHistory);
        } else {
          setAccessStats({ today: 0, week: 0, month: 0 });
          if (fileInfo) {
            setFileInfo({ ...fileInfo, accessHistory: [], viewCount: 0 });
          }
        }
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    }
    if (fileId) fetchFileMetadata();
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [fileId]);

  // Fetch file content only when fileInfo is set and is a text/mermaid file
  useEffect(() => {
    if (!fileInfo) return;
    const fileName = fileInfo.fileName.toLowerCase();
    if (
      isTextFile(fileInfo.contentType) ||
      fileName.endsWith(".mmd") ||
      fileName.endsWith(".mermaid")
    ) {
      setContentLoading(true);
      fetch(`/api/uploads/text-content/${fileInfo.id}`)
        .then((res) => {
          if (!res.ok)
            throw new Error("Text content not available for this file");
          return res.text();
        })
        .then((content) => {
          setFileContent(content);
          const isMermaid = checkIfMermaidDiagram(content);
          setIsMermaidDiagram(isMermaid);
          if (isMermaid) {
            setFileInfo((prev) =>
              prev
                ? {
                  ...prev,
                  description:
                    (prev.description || "") +
                    (prev.description ? " • " : "") +
                    "Contains Mermaid diagram",
                }
                : null,
            );
          }
        })
        .catch(() => setFileContent(null))
        .finally(() => setContentLoading(false));
    }
  }, [fileInfo, isTextFile, checkIfMermaidDiagram]);

  const calculateAccessStats = (history: { date: string; count: number }[]) => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);

    const todayCount =
      history.find((entry) => entry.date === today)?.count || 0;

    const weekCount = history.reduce((sum, entry) => {
      const entryDate = new Date(entry.date);
      if (entryDate >= oneWeekAgo) {
        return sum + entry.count;
      }
      return sum;
    }, 0);

    const monthCount = history.reduce((sum, entry) => sum + entry.count, 0);

    setAccessStats({
      today: todayCount,
      week: weekCount,
      month: monthCount,
    });
  };

  // Simplified time remaining calculation
  const updateTimeRemaining = (expiresAt: string | number | Date) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();

    if (diffMs <= 0) {
      setTimeRemaining("Expired");
      setError("This file has expired");
      return;
    }

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(
      (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffDays > 0) {
      setTimeRemaining(`${diffDays}d ${diffHours}h`);
    } else if (diffHours > 0) {
      setTimeRemaining(`${diffHours}h ${diffMinutes}m`);
    } else {
      setTimeRemaining(`${diffMinutes}m`);
    }
  };

  // Compute max expiry date string (29 days from today)
  const maxExpiryDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 29);
    return d.toISOString().split("T")[0];
  })();

  // Format bytes to readable size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Simple date formatter
  const formatDate = (dateString: string | number | Date): string => {
    return new Date(dateString).toLocaleDateString();
  };

  const handleDownload = () => {
    if (!fileInfo) return;
    window.location.href = `/api/uploads/${fileId}`;
    // Do NOT update downloadCount here; let the backend handle it only on real download
  };

  const handleCopyLink = () => {
    navigator.clipboard
      .writeText(`${window.location.origin}/crate/${fileId}`)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      });
  };

  // Handler to reset expiry
  const handleResetExpiry = async () => {
    setResetExpiryLoading(true);
    setResetExpiryError(null);
    setResetExpirySuccess(null);
    try {
      let durationMs = 0;
      if (expiryUnit === "days") {
        durationMs = expiryAmount * 24 * 60 * 60 * 1000;
      } else {
        durationMs = expiryAmount * 60 * 60 * 1000;
      }
      // Max 29 days
      const maxMs = 29 * 24 * 60 * 60 * 1000;
      if (durationMs > maxMs) {
        setResetExpiryError("Expiry cannot be more than 29 days.");
        setResetExpiryLoading(false);
        return;
      }
      if (durationMs < 60 * 60 * 1000) {
        setResetExpiryError("Expiry must be at least 1 hour.");
        setResetExpiryLoading(false);
        return;
      }
      const pickedDate = new Date(Date.now() + durationMs);
      const response = await fetch(`/api/files/${fileId}/expiry`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt: pickedDate.toISOString() }),
      });
      if (!response.ok) throw new Error("Failed to update expiry");
      setResetExpirySuccess("Expiry updated");
      setShowResetExpiry(false);
      setExpiryAmount(1);
      // Refresh file info
      const refreshed = await fetch(`/api/files/${fileId}`);
      if (refreshed.ok) {
        const data = await refreshed.json();
        setFileInfo(data);
        if (data.expiresAt) updateTimeRemaining(data.expiresAt);
      }
    } catch (err: any) {
      setResetExpiryError(err.message || "Failed to update expiry");
    } finally {
      setResetExpiryLoading(false);
      setTimeout(() => setResetExpirySuccess(null), 2000);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this file? This action cannot be undone.",
      )
    )
      return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete file");
      window.location.href = "/";
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete file");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Get file type icon
  const getFileIcon = () => {
    if (!fileInfo) return <FaFile className="text-gray-500" />;

    const contentType = fileInfo.contentType.toLowerCase();
    const fileName = fileInfo.fileName.toLowerCase();

    if (
      isMermaidDiagram ||
      fileName.endsWith(".mmd") ||
      fileName.endsWith(".mermaid")
    ) {
      return <FaProjectDiagram className="text-green-500" />;
    } else if (contentType.includes("image")) {
      return <FaFileImage className="text-blue-500" />;
    } else if (contentType.includes("pdf")) {
      return <FaFilePdf className="text-red-500" />;
    } else if (contentType.includes("markdown")) {
      return <FaFileAlt className="text-purple-500" />;
    } else if (
      contentType.includes("json") ||
      contentType.includes("javascript") ||
      contentType.includes("typescript")
    ) {
      return <FaFileCode className="text-yellow-500" />;
    } else if (contentType.includes("text")) {
      return <FaFileAlt className="text-gray-500" />;
    } else {
      return <FaFile className="text-gray-500" />;
    }
  };

  // Get appropriate syntax highlighting language
  const getLanguage = () => {
    if (!fileInfo) return "text";

    const contentType = fileInfo.contentType.toLowerCase();
    const fileName = fileInfo.fileName.toLowerCase();

    if (
      isMermaidDiagram ||
      fileName.endsWith(".mmd") ||
      fileName.endsWith(".mermaid")
    ) {
      return "mermaid";
    } else if (contentType.includes("markdown") || fileName.endsWith(".md")) {
      return "markdown";
    } else if (contentType.includes("json") || fileName.endsWith(".json")) {
      return "json";
    } else if (contentType.includes("javascript") || fileName.endsWith(".js")) {
      return "javascript";
    } else if (contentType.includes("typescript") || fileName.endsWith(".ts")) {
      return "typescript";
    } else if (contentType.includes("html") || fileName.endsWith(".html")) {
      return "html";
    } else if (contentType.includes("css") || fileName.endsWith(".css")) {
      return "css";
    } else {
      return "text";
    }
  };

  // Render metadata key-value pairs
  const renderMetadata = (metadata?: Record<string, string>) => {
    if (!metadata || Object.keys(metadata).length === 0) return null;
    return (
      <div className="mt-2 text-xs text-gray-600">
        <div className="font-semibold mb-1">Metadata:</div>
        <ul className="list-disc ml-4">
          {Object.entries(metadata).map(([key, value]) => (
            <li key={key}>
              <span className="font-medium">{key}:</span> {value}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 flex items-center justify-center">
        <div className="w-full max-w-lg bg-white rounded-lg shadow p-6 text-center">
          <div className="animate-pulse flex flex-col items-center">
            <div className="h-10 w-10 bg-primary-100 rounded-full mb-4"></div>
            <div className="h-5 w-40 bg-gray-200 rounded mb-3"></div>
            <div className="h-3 w-24 bg-gray-100 rounded mb-2"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !fileInfo) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 flex items-center justify-center">
        <Card className="w-full max-w-sm p-6 text-center">
          <FaExclamationTriangle className="text-yellow-500 text-2xl mx-auto mb-3" />
          <h1 className="text-lg font-medium text-gray-800 mb-2">
            File Unavailable
          </h1>
          <p className="text-gray-600 mb-5 text-sm">
            {error || "Unable to retrieve file information"}
          </p>

          <div className="flex justify-center space-x-4 mt-2">
            <Link
              href="/"
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm"
            >
              Home
            </Link>
            <Link
              href="/upload"
              className="px-3 py-1.5 bg-primary-500 text-white rounded hover:bg-primary-600 transition-colors text-sm"
            >
              <FaUpload className="inline mr-1 text-xs" /> Upload
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Calculate KPIs
  const compressionRate =
    fileInfo.originalSize && fileInfo.originalSize > fileInfo.size
      ? Math.round((1 - fileInfo.size / fileInfo.originalSize) * 100)
      : 0;

  const expiryDate = fileInfo.expiresAt ? new Date(fileInfo.expiresAt) : null;

  const daysUntilExpiry = expiryDate
    ? Math.max(
      0,
      Math.ceil(
        (expiryDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24),
      ),
    )
    : null;

  // Prepare usage chart data from access history
  const usageChartData = fileInfo.accessHistory
    ? fileInfo.accessHistory.map((entry) => ({
      label: entry.date.split("-").slice(1).join("/"), // Format as MM/DD
      value: entry.count,
    }))
    : [];

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb navigation */}
        <div className="mb-3 flex items-center text-sm">
          <Link
            href="/"
            className="text-gray-500 hover:text-primary-500 transition-colors"
          >
            Home
          </Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-700">File Details</span>
        </div>

        {/* Main Info Card */}
        <Card className="mb-4">
          <Card.Header className="flex justify-between items-center">
            <div className="flex items-center">
              <span className="p-2 bg-gray-50 rounded-full mr-3">
                {getFileIcon()}
              </span>
              <div>
                <h1
                  className="font-medium text-gray-800 mb-0.5"
                  title={fileInfo.fileName}
                >
                  {fileInfo.title || fileInfo.fileName}
                </h1>
                <div className="text-xs text-gray-500">
                  {formatBytes(fileInfo.size)} • Uploaded{" "}
                  {formatDate(fileInfo.uploadedAt)}
                </div>
              </div>
            </div>

            {timeRemaining && (
              <div className="text-xs px-2 py-1 rounded bg-primary-50 text-primary-700 flex items-center">
                <FaClock className="mr-1" /> {timeRemaining} remaining
              </div>
            )}
          </Card.Header>

          <Card.Body>
            {/* Sharing status and password protection */}
            <div className="mb-4 flex items-center gap-3">
              {fileInfo.isShared ? (
                <span className="inline-flex items-center px-2 py-1 text-xs rounded bg-green-100 text-green-700">
                  <FaShareAlt className="mr-1" /> Shared (anyone with link)
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-1 text-xs rounded bg-gray-200 text-gray-700">
                  <FaLock className="mr-1" /> Private (only you)
                </span>
              )}
              {fileInfo.isShared && fileInfo.password && (
                <span className="inline-flex items-center px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-700">
                  <FaLock className="mr-1" /> Password protected
                </span>
              )}
            </div>
            {fileInfo.description && (
              <div className="text-sm text-gray-700 mb-4 pb-3 border-b border-gray-100">
                {fileInfo.description}
              </div>
            )}
            {/* Metadata display */}
            {renderMetadata(fileInfo.metadata)}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-sm">
              <div>
                <div className="text-xs text-gray-500 mb-1">Filename</div>
                <div className="truncate" title={fileInfo.fileName}>
                  {fileInfo.fileName}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Downloads</div>
                <div className="font-medium">{fileInfo.downloadCount}</div>
              </div>

              {fileInfo.expiresAt && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Expiration</div>
                  <div>{formatDate(fileInfo.expiresAt)}</div>
                </div>
              )}

              <div>
                <div className="text-xs text-gray-500 mb-1">Size</div>
                <div>
                  {formatBytes(fileInfo.size)}
                  {compressionRate > 0 && (
                    <span className="ml-1 text-xs text-green-600">
                      ({compressionRate}% compressed)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownload}
                className="flex items-center justify-center px-4 py-2 bg-blue-500 text-white text-base font-medium rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 transition-colors border border-blue-600"
              >
                <FaFileDownload className="mr-2 text-lg" />
                <span>Download</span>
              </button>

              <button
                onClick={handleCopyLink}
                className="flex items-center justify-center px-3 py-1.5 bg-gray-100 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
              >
                {linkCopied ? (
                  <>
                    <FaCheck className="mr-1" /> Copied
                  </>
                ) : (
                  <>
                    <FaShareAlt className="mr-1" /> Share
                  </>
                )}
              </button>

              {(isTextFile(fileInfo.contentType) ||
                isMermaidDiagram ||
                isImageFile(fileInfo.contentType)) && (
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center justify-center px-3 py-1.5 bg-gray-100 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors ml-auto"
                  >
                    <FaEye className="mr-1" />{" "}
                    {showPreview ? "Hide Preview" : "View Content"}
                  </button>
                )}
              <button
                onClick={() => setShowResetExpiry(true)}
                className="flex items-center justify-center px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 border border-blue-700 font-semibold shadow transition-colors"
                title="Reset Expiry"
              >
                <FaClock className="mr-1" /> Reset Expiry
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex items-center justify-center px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 border border-red-700 font-semibold shadow transition-colors"
                title="Delete File"
              >
                {deleteLoading ? (
                  "Deleting..."
                ) : (
                  <>
                    <FaFile className="mr-1" /> Delete
                  </>
                )}
              </button>
              {deleteError && (
                <div className="text-red-600 mt-2 text-sm">{deleteError}</div>
              )}
            </div>
            {/* Reset Expiry Modal/Inline */}
            {showResetExpiry && (
              <div className="mt-4 p-6 border border-gray-200 rounded-lg bg-white shadow-lg max-w-md">
                <div className="mb-3 font-semibold text-gray-800 text-base">
                  Set new expiry duration (max 29 days):
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="number"
                    min={expiryUnit === "days" ? 1 : 1}
                    max={expiryUnit === "days" ? 29 : 696}
                    value={expiryAmount}
                    onChange={(e) => setExpiryAmount(Number(e.target.value))}
                    className="border border-gray-300 px-2 py-1 rounded w-20 focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                  />
                  <select
                    value={expiryUnit}
                    onChange={(e) =>
                      setExpiryUnit(e.target.value as "days" | "hours")
                    }
                    className="border border-gray-300 px-2 py-1 rounded focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                  >
                    <option value="days">days</option>
                    <option value="hours">hours</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleResetExpiry}
                    disabled={resetExpiryLoading || !expiryAmount}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-semibold shadow border border-blue-700 transition-colors"
                  >
                    {resetExpiryLoading ? "Updating..." : "Update Expiry"}
                  </button>
                  <button
                    onClick={() => {
                      setShowResetExpiry(false);
                      setResetExpiryError(null);
                      setExpiryAmount(1);
                      setExpiryUnit("days");
                    }}
                    className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 border border-gray-300"
                  >
                    Cancel
                  </button>
                </div>
                {resetExpiryError && (
                  <div className="text-red-600 mt-3 text-sm">
                    {resetExpiryError}
                  </div>
                )}
                {resetExpirySuccess && (
                  <div className="text-green-600 mt-3 text-sm">
                    {resetExpirySuccess}
                  </div>
                )}
              </div>
            )}
          </Card.Body>
        </Card>

        {/* KPI Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Usage Stats Card */}
          <StatsCard
            title="Usage Statistics"
            icon={<FaChartBar className="text-primary-500" />}
            tooltip="File access statistics over time"
          >
            <div className="mb-5">
              <StatsCard.Grid columns={3} className="mb-4">
                <StatsCard.Stat
                  label="Today"
                  value={accessStats.today}
                  icon={<FaEye />}
                />
                <StatsCard.Stat
                  label="This week"
                  value={accessStats.week}
                  icon={<FaEye />}
                />
                <StatsCard.Stat
                  label="Total views"
                  value={fileInfo.viewCount || 0}
                  icon={<FaEye />}
                />
              </StatsCard.Grid>

              {usageChartData.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 mb-2">
                    7-Day Access Trend
                  </div>
                  <StatsCard.Chart
                    data={usageChartData}
                    type="bar"
                    height={100}
                    color="#3b82f6"
                  />
                </div>
              )}
            </div>
          </StatsCard>

          {/* Storage Stats */}
          <StatsCard
            title="Storage Details"
            icon={<FaDatabase className="text-blue-500" />}
          >
            <div className="mb-2">
              <StatsCard.Grid columns={2} className="mb-4">
                <StatsCard.Stat
                  label="Size"
                  value={formatBytes(fileInfo.size)}
                  icon={<FaFileAlt />}
                />
                <StatsCard.Stat
                  label="Downloads"
                  value={fileInfo.downloadCount}
                  icon={<FaDownload />}
                />
              </StatsCard.Grid>

              {fileInfo.originalSize &&
                fileInfo.originalSize > fileInfo.size && (
                  <div className="mt-3">
                    <StatsCard.Progress
                      label="Compression"
                      value={compressionRate}
                      max={100}
                      color="green"
                    />
                    <div className="text-xs text-gray-500 mt-2 flex justify-between">
                      <span>
                        Original: {formatBytes(fileInfo.originalSize)}
                      </span>
                      <span>
                        Saved:{" "}
                        {formatBytes(fileInfo.originalSize - fileInfo.size)}
                      </span>
                    </div>
                  </div>
                )}
            </div>
          </StatsCard>

          {/* Time Related Stats */}
          <StatsCard
            title="Timeline"
            icon={<FaHistory className="text-purple-500" />}
          >
            <div className="space-y-4">
              <StatsCard.Stat
                label="Uploaded on"
                value={formatDate(fileInfo.uploadedAt)}
                icon={<FaCalendarAlt />}
                className="mb-2"
              />

              {fileInfo.expiresAt && (
                <>
                  <StatsCard.Stat
                    label="Expires on"
                    value={formatDate(fileInfo.expiresAt)}
                    icon={<FaClock />}
                    className="mb-2"
                  />

                  {daysUntilExpiry !== null && daysUntilExpiry > 0 && (
                    <div className="mt-3">
                      <StatsCard.Progress
                        label="Time Remaining"
                        value={daysUntilExpiry}
                        max={30} // Assuming max expiry is 30 days
                        color={daysUntilExpiry < 3 ? "red" : "primary"}
                      />
                      <div className="text-xs text-gray-500 mt-1 flex justify-end">
                        <span>{daysUntilExpiry} days left</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </StatsCard>
        </div>

        {/* Preview Card - Only shown when preview is toggled */}
        {showPreview && (fileContent || isImageFile(fileInfo.contentType)) && (
          <Card className="mb-4">
            <Card.Header className="flex justify-between items-center">
              <h2 className="font-medium text-gray-700">File Preview</h2>
              <button
                onClick={() => setShowPreview(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </Card.Header>

            <Card.Body>
              {/* Mermaid Diagram Preview */}
              {isMermaidDiagram && fileContent && (
                <div className="mb-4">
                  <MermaidDiagram>{fileContent}</MermaidDiagram>
                </div>
              )}

              {/* Text Content Preview */}
              {isTextFile(fileInfo.contentType) &&
                fileContent &&
                !contentLoading &&
                !isMermaidDiagram && (
                  <div className="bg-gray-50 rounded border overflow-auto max-h-96">
                    {fileInfo.contentType.includes("markdown") ? (
                      <div className="p-4 prose max-w-none">
                        <ReactMarkdown>{fileContent}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-sm">
                        <SyntaxHighlighter
                          language={getLanguage()}
                          showLineNumbers
                        >
                          {fileContent}
                        </SyntaxHighlighter>
                      </div>
                    )}
                  </div>
                )}

              {/* Image Preview */}
              {isImageFile(fileInfo.contentType) && (
                <div className="flex items-center justify-center">
                  <Image
                    src={`/api/uploads/${fileId}`}
                    alt={fileInfo.fileName}
                    className="max-w-full max-h-96 object-contain"
                    width={600}
                    height={400}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = "/icon.png";
                      target.style.height = "80px";
                      target.style.width = "80px";
                    }}
                  />
                </div>
              )}

              {contentLoading && (
                <div className="h-48 flex items-center justify-center">
                  <div className="animate-pulse">Loading content...</div>
                </div>
              )}
            </Card.Body>
          </Card>
        )}

        {/* Footer Navigation */}
        <div className="flex justify-between items-center text-sm mt-4 px-1">
          <Link
            href="/"
            className="text-primary-500 hover:text-primary-600 transition-colors flex items-center"
          >
            <FaArrowLeft className="mr-1 text-xs" /> Back to Home
          </Link>
          <Link
            href="/upload"
            className="text-primary-500 hover:text-primary-600 transition-colors flex items-center"
          >
            <FaUpload className="mr-1 text-xs" /> Upload New File
          </Link>
        </div>
      </div>
    </div>
  );
}
