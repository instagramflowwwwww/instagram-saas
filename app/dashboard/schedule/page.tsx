"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  Film,
  ImageIcon,
  Instagram,
  Layers3,
  Loader2,
  Plus,
  RotateCcw,
  Shuffle,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import toast from "react-hot-toast"
import { uploadFileToR2 } from "@/lib/r2-upload"

type MediaItem = {
  id: string
  url: string
  type: "image" | "video"
  fileName: string
  createdAt: string
}

type InstagramAccount = {
  id: string
  username: string
  profilePicture: string | null
  connectionType: string
  isActive: boolean
  requiresReconnect: boolean
}

type CaptionDraft = {
  caption: string
  hashtags: string
}

type CoverUpload = {
  file: File
  preview: string
}

const INTERVAL_OPTIONS = [5, 10, 15, 30, 60, 120, 360, 720, 1440]
const IMAGE_LIMIT = 8 * 1024 * 1024

function toLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function formatSchedule(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SchedulePage() {
  const router = useRouter()
  const [media, setMedia] = useState<MediaItem[]>([])
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [selectedMedia, setSelectedMedia] = useState<string[]>([])
  const [showAllMedia, setShowAllMedia] = useState(false)
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const [startAt, setStartAt] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 10 * 60 * 1000))
  )
  const [intervalMinutes, setIntervalMinutes] = useState(10)
  const [captionMode, setCaptionMode] = useState<"single" | "per_media" | "rotate">("single")
  const [singleCaption, setSingleCaption] = useState("")
  const [singleHashtags, setSingleHashtags] = useState("")
  const [perMedia, setPerMedia] = useState<Record<string, CaptionDraft>>({})
  const [rotationCaptions, setRotationCaptions] = useState<CaptionDraft[]>([{ caption: "", hashtags: "" }])
  const [coverMode, setCoverMode] = useState<"none" | "single" | "per_video">("none")
  const [sharedCover, setSharedCover] = useState<CoverUpload | null>(null)
  const [perVideoCovers, setPerVideoCovers] = useState<Record<string, CoverUpload>>({})
  const sharedCoverRef = useRef<CoverUpload | null>(null)
  const perVideoCoversRef = useRef<Record<string,
